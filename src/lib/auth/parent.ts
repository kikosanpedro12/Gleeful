import "server-only";
import { CONSENT_VERSION } from "@/lib/consent/text";
import { createServerSupabase, type ServerSupabase } from "@/lib/supabase/server";

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

/** The signed-in parent's id from the verified session, or null. */
export async function currentParentId(supabase: ServerSupabase): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data) return null;
    return claimsToParentId(data.claims);
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

export interface ParentAccess { id: string; consented: boolean }

/** Short cache so a lesson's every turn does not hit the database. Per warm instance, so a withdrawal is felt within CACHE_MS. */
const CACHE_MS = 30_000;
const CACHE_MAX = 2000;
const cache = new Map<string, { at: number; consented: boolean }>();
export function forgetConsentCache(parentId: string) { cache.delete(parentId); }
export function clearConsentCache() { cache.clear(); }

/** Used by /api/brain: who is calling, and may their children's messages go to the AI? null = not signed in. */
export async function resolveParentAccess(now: number = Date.now()): Promise<ParentAccess | null> {
  const supabase = await createServerSupabase();
  if (!supabase) return null;
  const id = await currentParentId(supabase);
  if (!id) return null;
  const hit = cache.get(id);
  if (hit && now - hit.at < CACHE_MS) return { id, consented: hit.consented };
  const consented = await hasCurrentConsent(supabase, id);
  if (cache.size >= CACHE_MAX) for (const [k, v] of cache) if (now - v.at >= CACHE_MS) cache.delete(k);
  if (cache.size < CACHE_MAX) cache.set(id, { at: now, consented });
  return { id, consented };
}
