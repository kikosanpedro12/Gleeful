/**
 * First-party product events: the fixed code list and the pure validation. COUNTS ONLY: no child content, no names,
 * no e-mail. Pure (no server-only import) so the proxy, the callback and the tests share one set of rules.
 * Must match the CHECKs in supabase/migrations/20261123210909_app_events.sql (tests/db/appEvents.test.ts compares).
 */
export const EVENT_CODES = ["signup", "consent_given", "learner_added", "active_day", "checkout_clicked", "brain_error", "brain_fallback", "voice_error"] as const;
export type EventCode = (typeof EVENT_CODES)[number];
/** Codes an anonymous visitor can cause (landing Ask box, voice): no parent id, capped harder in the database. */
export const ERROR_CODES = ["brain_error", "brain_fallback", "voice_error"] as const;
export const isEventCode = (c: unknown): c is EventCode => typeof c === "string" && (EVENT_CODES as readonly string[]).includes(c);
export const isErrorCode = (c: string): boolean => (ERROR_CODES as readonly string[]).includes(c);

export interface EventContext {
  parentId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrerHost?: string | null;
}
export interface ValidEvent { code: EventCode; parentId: string | null; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; referrerHost: string | null }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TAG_RE = /^[a-z0-9_.-]{1,40}$/;
const HOST_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * A campaign tag (utm_source and friends). Lower-cased and trimmed, then it must ALREADY be only [a-z0-9_.-], 1 to 40 long.
 * Anything else (a space, '@', punctuation, non-ASCII, too long) is DROPPED, never rewritten: a rewritten value is a value
 * we invented, and a dropped one cannot smuggle an e-mail or other text through.
 */
export function sanitizeTag(v: unknown): string | null {
  if (typeof v !== "string" || v.length === 0 || v.length > 100) return null;
  const t = v.trim().toLowerCase();
  return TAG_RE.test(t) ? t : null;
}

/** A host name only (no scheme, path, port, user info); "www." removed. Null when it is not a plain DNS name or is an IP address. */
export function sanitizeHost(v: unknown): string | null {
  if (typeof v !== "string" || v.length === 0 || v.length > 120) return null;
  const h = v.trim().toLowerCase().replace(/^www\./, "");
  if (h.length < 3 || h.length > 100 || !h.includes(".") || !HOST_RE.test(h) || h.includes("..") || IPV4_RE.test(h)) return null;
  return h;
}

/** Everything the database would accept, or null. Parent-bearing codes need a valid parent id; error codes never keep one. */
export function validateEvent(code: unknown, ctx: EventContext = {}): ValidEvent | null {
  if (!isEventCode(code)) return null;
  const err = isErrorCode(code);
  let parentId: string | null = null;
  if (!err) {
    const p = typeof ctx.parentId === "string" ? ctx.parentId.toLowerCase() : "";
    if (!UUID_RE.test(p)) return null;
    parentId = p;
  }
  // Campaign tags only matter at signup; elsewhere they are dropped so a row never carries more than it needs.
  const tags = code === "signup";
  return {
    code, parentId,
    utmSource: tags ? sanitizeTag(ctx.utmSource) : null,
    utmMedium: tags ? sanitizeTag(ctx.utmMedium) : null,
    utmCampaign: tags ? sanitizeTag(ctx.utmCampaign) : null,
    referrerHost: tags ? sanitizeHost(ctx.referrerHost) : null,
  };
}

/** Which stored event a server-side counter name maps to (src/lib/admin/events.ts), or null when it is not one we keep. */
export function eventForServerCounter(source: string, event: string): EventCode | null {
  if (source === "voice") return "voice_error";
  if (source !== "brain" && source !== "taste") return null;
  if (event === "upstream_error" || event === "auth_error") return "brain_error";
  if (event === "bad_model_output") return "brain_fallback";
  return null;
}
