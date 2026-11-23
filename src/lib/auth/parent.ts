import "server-only";
import { CONSENT_VERSION } from "@/lib/consent/text";
import { createServerSupabase, type ServerSupabase } from "@/lib/supabase/server";
import { paymentsMode } from "@/lib/billing/config";
import { decide } from "@/lib/billing/plans";
import { pgStore, type BillingStore } from "@/lib/billing/store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turns verified JWT claims into a parent id, or null. Anonymous sessions and
 * non-"authenticated" roles are not parents. (Claims here come from getClaims(),
 * which verifies the token; never read them from getSession() on the server.)
 */
export function claimsToParentId(claims: unknown): string | null {
  if (!claims || typeof claims !== "object") return null;
  const c = claims as { sub?: unknown; role?: unknown; is_anonymous?: unknown };
  if (typeof c.sub !== "string" || !UUID_RE.test(c.sub)) return null;
  if (c.role !== "authenticated") return null;
  if (c.is_anonymous === true) return null;
  return c.sub.toLowerCase();
}

/** The verified e-mail claim (lower case), or null. Billing is keyed on it, so it is only read from verified claims. */
export function claimsToEmail(claims: unknown): string | null {
  if (!claims || typeof claims !== "object") return null;
  const c = claims as { email?: unknown; email_verified?: unknown };
  if (c.email_verified === false) return null; // an unconfirmed address never matches a plan
  const e = c.email;
  if (typeof e !== "string" || e.length < 3 || e.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return null;
  return e.toLowerCase();
}

/** The signed-in parent's id from the verified session, or null. */
export async function currentParentId(supabase: ServerSupabase): Promise<string | null> {
  return (await currentParent(supabase))?.id ?? null;
}

/** Id and verified e-mail from one getClaims() call. */
export async function currentParent(supabase: ServerSupabase): Promise<{ id: string; email: string | null } | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data) return null;
    const id = claimsToParentId(data.claims);
    return id ? { id, email: claimsToEmail(data.claims) } : null;
  } catch {
    return null;
  }
}

/** True when this parent has an active (not withdrawn) consent for the CURRENT wording. Errors count as "no". */
export async function hasCurrentConsent(supabase: ServerSupabase, parentId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("parental_consents")
      .select("id")
      .eq("parent_id", parentId)
      .eq("consent_text_version", CONSENT_VERSION)
      .is("withdrawn_at", null)
      .limit(1);
    return !error && Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

export type DenyReason = "no_subscription" | "inactive" | "expired" | "cap_reached" | "billing_unavailable";
export interface ParentAccess {
  id: string;
  consented: boolean;
  /**
   * May this parent use the paid live tutor right now? Always true while PAYMENTS_MODE is off. Otherwise it needs a
   * trial or plan with allowance left (src/lib/billing/plans.ts decide()). Fails CLOSED when billing cannot be read.
   */
  entitled: boolean;
  /** Why not, when entitled is false: a Decision reason, or "billing_unavailable". */
  denied?: DenyReason;
  /** Where to count this parent's turns (set when entitled and billing is on). */
  usage?: { email: string; periodEnd: string };
  /** Verified e-mail, for the billing screen. */
  email: string | null;
}

/** Short cache so a lesson's every turn does not hit the database. Per warm instance, so a withdrawal is felt within CACHE_MS. */
const CACHE_MS = 30_000;
const CACHE_MAX = 2000;
type Entry = { at: number; consented: boolean; ent: Pick<ParentAccess, "entitled" | "denied" | "usage"> };
const cache = new Map<string, Entry>();
export function forgetConsentCache(parentId: string) { cache.delete(parentId); }
export function clearConsentCache() { cache.clear(); }

/** Entitlement from the billing store. Pure of cookies so tests can drive it. Never throws. */
export async function entitlementFor(email: string | null, store: BillingStore, now: Date): Promise<Pick<ParentAccess, "entitled" | "denied" | "usage">> {
  if (!email) return { entitled: false, denied: "no_subscription" };
  try {
    const { sub, usedTurns } = await store.lookup(email);
    const d = decide(sub, usedTurns, now);
    if (!d.allowed) return { entitled: false, denied: d.reason };
    return { entitled: true, usage: sub?.periodEnd ? { email, periodEnd: sub.periodEnd } : undefined };
  } catch {
    return { entitled: false, denied: "billing_unavailable" };
  }
}

/** Used by /api/brain: who is calling, and may their children's messages go to the AI? null = not signed in. */
export async function resolveParentAccess(now: number = Date.now(), store: BillingStore = pgStore): Promise<ParentAccess | null> {
  const supabase = await createServerSupabase();
  if (!supabase) return null;
  const who = await currentParent(supabase);
  if (!who) return null;
  const { id, email } = who;
  const hit = cache.get(id);
  if (hit && now - hit.at < CACHE_MS) return { id, email, consented: hit.consented, ...hit.ent };
  const consented = await hasCurrentConsent(supabase, id);
  const ent = paymentsMode() === "off" ? { entitled: true } : await entitlementFor(email, store, new Date(now));
  if (cache.size >= CACHE_MAX) for (const [k, v] of cache) if (now - v.at >= CACHE_MS) cache.delete(k);
  if (cache.size < CACHE_MAX) cache.set(id, { at: now, consented, ent });
  return { id, email, consented, ...ent };
}
