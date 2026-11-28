import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safeNext";
import { CAMPAIGN_COOKIE, decodeCampaign } from "@/lib/events/campaign";
import { isFreshAccount } from "@/lib/events/signup";
import { recordEvent } from "@/lib/events/record";
import { later } from "@/lib/events/later";

export const dynamic = "force-dynamic";

const OTP_TYPES: readonly string[] = ["magiclink", "signup", "email", "recovery", "invite", "email_change"];

/**
 * Where the emailed link lands. Two shapes are accepted: `code` (the default PKCE link; must be opened in
 * the browser that asked for it) and `token_hash` + `type` (custom email templates; works from any browser).
 * `next` goes through safeNext(), so this can only ever redirect to one of our own pages.
 * Every failure looks the same: back to /sign-in with a generic notice.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const fail = () => NextResponse.redirect(new URL(`/sign-in?error=link&next=${encodeURIComponent(next)}`, req.url), 303);
  const supabase = await createServerSupabase();
  if (!supabase) return fail();
  try {
    const code = searchParams.get("code");
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");
    let error: unknown = new Error("no credentials");
    let user: { id?: string; created_at?: string; is_anonymous?: boolean } | null = null;
    if (code && code.length <= 200) { const r = await supabase.auth.exchangeCodeForSession(code); error = r.error; user = r.data?.user ?? null; }
    else if (tokenHash && tokenHash.length <= 200 && type && OTP_TYPES.includes(type)) { const r = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash }); error = r.error; user = r.data?.user ?? null; }
    if (error) return fail();
    // A brand-new account (created in the last 2 hours; the database keeps one signup per parent). Counts only: the id, and where they came from.
    if (user && typeof user.id === "string" && !user.is_anonymous && isFreshAccount(user.created_at, Date.now())) {
      const c = decodeCampaign(req.cookies.get(CAMPAIGN_COOKIE)?.value);
      const parentId = user.id;
      later(() => recordEvent("signup", { parentId, utmSource: c.source, utmMedium: c.medium, utmCampaign: c.campaign, referrerHost: c.refHost })); // after the redirect is sent: sign-in never waits on it
    }
  } catch {
    return fail();
  }
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.headers.set("cache-control", "private, no-store"); // a response that sets a session cookie must never be cached
  return res;
}
