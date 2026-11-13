import "server-only";
import { handleSignIn, makeSignInDeps, type AuthPort } from "@/lib/auth/signin";
import { createServerSupabase } from "@/lib/supabase/server";
import { normaliseSiteUrl } from "@/lib/seo/site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

// One brake table per warm instance (see signin.ts for the honest status).
const shared = makeSignInDeps({ port: null, siteUrl: "" });

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const port: AuthPort | null = supabase && {
    async signInWithPassword(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return !error;
    },
    async signInWithOtp(email, redirectTo) {
      await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
    },
    async signUp(email, password, redirectTo) {
      await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
    },
  };
  // The link in the email points at our own site: the configured one, else the origin this request came to.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ? normaliseSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) : new URL(req.url).origin;
  return handleSignIn(req, { ...shared, port, siteUrl });
}
