import { redirect } from "next/navigation";
import { accountsAvailable } from "@/lib/supabase/env";
import { createServerSupabase } from "@/lib/supabase/server";
import { currentParentId } from "@/lib/auth/parent";
import { safeNext } from "@/lib/auth/safeNext";
import { MESSAGES } from "@/lib/auth/signin";
import SignInForm from "./SignInForm";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const next = safeNext(first(sp.next));
  const linkProblem = first(sp.error) === "link";
  const googleProblem = first(sp.error) === "google";

  if (!accountsAvailable()) {
    return (
      <main className="auth">
        <a href="/">← Gleeful</a>
        <h1>Parent sign-in</h1>
        <p className="warn" role="status" data-testid="signin-unavailable">{MESSAGES.unavailable}</p>
        <a className="primary" href="/learn">Try the classroom demo</a>
      </main>
    );
  }

  const supabase = await createServerSupabase();
  if (supabase && (await currentParentId(supabase))) redirect(next);

  return (
    <main className="auth">
      <a href="/">← Gleeful</a>
      <h1>Parent sign-in</h1>
      <p>Only parents have accounts. Children use Gleeful on a parent&apos;s signed-in device, and you choose what is stored about them.</p>
      {linkProblem && <p className="warn" role="alert">That sign-in link didn&apos;t work. It may have expired, been used already, or been opened in a different browser. Request a new one below.</p>}
      {googleProblem && <p className="warn" role="alert">Google sign-in didn&apos;t work this time. Please try again, or use an email link instead.</p>}
      <a className="google-btn" href={`/auth/google?next=${encodeURIComponent(next)}`} data-testid="auth-google">
        <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true" focusable="false">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        <span>Continue with Google</span>
      </a>
      <p className="auth-or fine" aria-hidden="true">or</p>
      <SignInForm next={next} />
      <small className="fine">Early-access version. <a href="/privacy">Privacy notice</a>.</small>
    </main>
  );
}
