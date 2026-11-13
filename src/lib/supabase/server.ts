import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { readSupabasePublicEnv } from "./env";

/**
 * A Supabase client that acts AS the signed-in parent (their cookie session, the
 * publishable key). Row-level security decides what it can read and write.
 * Returns null when accounts are not configured. There is deliberately no
 * client that uses the secret key anywhere in this app.
 */
export async function createServerSupabase() {
  const cfg = readSupabasePublicEnv();
  if (!cfg) return null;
  const store = await cookies();
  return createServerClient(cfg.url, cfg.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        // Server Components cannot set cookies; the proxy refreshes the session on every request instead.
        try { for (const { name, value, options } of list) store.set(name, value, options); } catch { /* read-only context */ }
      },
    },
  });
}
export type ServerSupabase = NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>;
