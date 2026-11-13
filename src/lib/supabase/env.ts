/**
 * Supabase settings that are SAFE for the server to read: the project URL and the
 * publishable (anon) key. The secret / service_role key is never read here and
 * never imported anywhere in the app: sign-in and the parent area run as the
 * signed-in parent, so Postgres row-level security does the protecting.
 *
 * If either value is missing or looks wrong, accounts are simply "not available":
 * the public demo keeps working and the sign-in page says so honestly.
 */
export interface SupabasePublicEnv { url: string; key: string }

/** A secret key must never be used as the public key (it would bypass row-level security). */
export function looksLikeSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { role?: unknown };
      if (payload.role === "service_role") return true;
    } catch { /* not a JWT we can read: fall through */ }
  }
  return false;
}

export function readSupabasePublicEnv(env: Record<string, string | undefined> = process.env): SupabasePublicEnv | null {
  const rawUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!rawUrl || !key) return null;
  if (looksLikeSecretKey(key)) return null;
  try {
    const u = new URL(rawUrl);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !local) return null;
    return { url: u.origin, key };
  } catch {
    return null;
  }
}

export const accountsAvailable = (env: Record<string, string | undefined> = process.env) => readSupabasePublicEnv(env) !== null;
