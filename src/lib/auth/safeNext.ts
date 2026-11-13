/**
 * Where to send a parent after sign-in. The `next` value comes from a URL, so it
 * is untrusted: only a short list of our own pages is ever returned, as a plain
 * path (never a full URL, never a query string), so it cannot become an open redirect.
 */
export const NEXT_ALLOWED = ["/parent", "/learn"] as const;
export const NEXT_DEFAULT = "/parent";

export function safeNext(raw: unknown, fallback: string = NEXT_DEFAULT): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 200) return fallback;
  // Control characters, backslashes (browsers treat "\" as "/") and percent-encoding are never needed for our paths.
  if (/[\u0000-\u001f\u007f\\%]/.test(raw)) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  let path: string;
  try {
    const u = new URL(raw, "http://gleeful.invalid");
    if (u.origin !== "http://gleeful.invalid") return fallback;
    path = u.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return fallback;
  }
  return (NEXT_ALLOWED as readonly string[]).includes(path) ? path : fallback;
}
