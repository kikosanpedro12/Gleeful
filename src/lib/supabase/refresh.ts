import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { readSupabasePublicEnv } from "./env";

export interface RefreshResult {
  cookies: { name: string; value: string; options: CookieOptions }[];
  /** Cache headers the auth library requires on any response that sets auth cookies. */
  headers: Record<string, string>;
}

/**
 * Keeps a parent's session fresh. Server Components cannot write cookies, so
 * the proxy refreshes an expiring session on the way in: the new cookies are put on
 * the request (so the page sees them) and returned to be set on the response.
 *
 * Does nothing for visitors without an auth cookie (the public site pays nothing),
 * and never throws: a failure just leaves the visitor signed out.
 */
export async function refreshSession(request: NextRequest): Promise<RefreshResult> {
  const result: RefreshResult = { cookies: [], headers: {} };
  const cfg = readSupabasePublicEnv();
  if (!cfg) return result;
  if (!request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) return result;
  const supabase = createServerClient(cfg.url, cfg.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list, headers) {
        for (const c of list) { request.cookies.set(c.name, c.value); result.cookies.push(c); }
        if (headers) Object.assign(result.headers, headers);
      },
    },
  });
  try { await supabase.auth.getClaims(); } catch { /* signed out */ }
  return result;
}
