import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safeNext";

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
    if (code && code.length <= 200) ({ error } = await supabase.auth.exchangeCodeForSession(code));
    else if (tokenHash && tokenHash.length <= 200 && type && OTP_TYPES.includes(type)) ({ error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash }));
    if (error) return fail();
  } catch {
    return fail();
  }
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.headers.set("cache-control", "private, no-store"); // a response that sets a session cookie must never be cached
  return res;
}
