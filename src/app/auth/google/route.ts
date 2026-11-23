import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safeNext";
import { normaliseSiteUrl } from "@/lib/seo/site";
import { RateLimiter } from "@/lib/brain/server/limits";
import { clientIp } from "@/lib/http/request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A brake per warm instance (Supabase and Google have their own limits). Starting the flow stores nothing and costs nothing.
const brake = new RateLimiter(30, 10 * 60_000);

/**
 * Starts "Continue with Google". A plain link (a navigation), not a form post: the CSP form-action list would block the
 * hop on to accounts.google.com. Supabase Auth does the OAuth with Google, then sends the browser to /auth/callback
 * (the same code exchange the emailed link uses). The return address is built from our configured site, never from the
 * request, and `next` goes through safeNext(), so this can only land on one of our own pages.
 * Every failure looks the same: back to /sign-in with a generic notice.
 */
export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const fail = () => NextResponse.redirect(new URL(`/sign-in?error=google&next=${encodeURIComponent(next)}`, req.url), 303);
  const ip = clientIp(req);
  // Requests whose address cannot be read share no bucket: the route is free and stores nothing, so we do not lock real people out.
  if (ip !== "unknown" && brake.take(ip, Date.now()) > 0) return fail();
  const supabase = await createServerSupabase();
  if (!supabase) return fail();
  try {
    const siteUrl = normaliseSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`, skipBrowserRedirect: true },
    });
    if (error || !data?.url) return fail();
    const to = new URL(data.url);
    if (to.protocol !== "https:") return fail();
    const res = NextResponse.redirect(to, 303);
    res.headers.set("cache-control", "private, no-store");
    return res;
  } catch {
    return fail();
  }
}
