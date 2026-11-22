/**
 * Who may open /admin. Pure functions (no I/O) so they are easy to test; the route guard is in guard.ts.
 *
 * The allowlist is the server-only env var ADMIN_EMAILS: a comma list of sign-in emails and/or Supabase user ids
 * (UUIDs). Empty or unset = nobody. Never NEXT_PUBLIC_. Entries that do not look like a plain email or a UUID are
 * DROPPED (no wildcards, no domains, no "*"), so a typo can only ever shrink the list, never widen it.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Plain ASCII email: one "@", no spaces, quotes, commas or wildcards. Deliberately stricter than the RFC.
const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const MAX_ENTRIES = 20;
const MAX_ENTRY_LEN = 254;

export interface AdminAllowlist { emails: ReadonlySet<string>; ids: ReadonlySet<string> }

export function parseAllowlist(raw: string | undefined | null): AdminAllowlist {
  const emails = new Set<string>();
  const ids = new Set<string>();
  if (typeof raw !== "string" || raw.length > 4000) return { emails, ids };
  for (const part of raw.split(",").slice(0, MAX_ENTRIES)) {
    const v = part.trim().toLowerCase();
    if (!v || v.length > MAX_ENTRY_LEN) continue;
    if (UUID_RE.test(v)) ids.add(v);
    else if (EMAIL_RE.test(v)) emails.add(v);
  }
  return { emails, ids };
}

export const allowlistSize = (a: AdminAllowlist) => a.emails.size + a.ids.size;

/**
 * Is the signed-in user (from VERIFIED claims: getClaims, never getSession) on the list?
 * Anonymous sessions and non-"authenticated" roles never match. Matching is exact on the lower-cased value:
 * no substring, no domain, no normalisation tricks.
 */
export function isAdminClaims(claims: unknown, list: AdminAllowlist): boolean {
  if (allowlistSize(list) === 0) return false; // fail closed
  if (!claims || typeof claims !== "object") return false;
  const c = claims as { sub?: unknown; email?: unknown; role?: unknown; is_anonymous?: unknown; email_verified?: unknown };
  if (c.role !== "authenticated" || c.is_anonymous === true) return false;
  if (typeof c.sub === "string" && list.ids.has(c.sub.trim().toLowerCase())) return true;
  if (c.email_verified === false) return false; // an unverified email never matches (the id still can)
  if (typeof c.email === "string" && c.email.length <= MAX_ENTRY_LEN && list.emails.has(c.email.trim().toLowerCase())) return true;
  return false;
}
