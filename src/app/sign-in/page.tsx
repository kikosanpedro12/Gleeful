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
      <a className="primary" href={`/auth/google?next=${encodeURIComponent(next)}`} data-testid="auth-google">Continue with Google</a>
      <p className="fine" aria-hidden="true">or</p>
      <SignInForm next={next} />
      <small className="fine">Early-access version. <a href="/privacy">Privacy notice</a>.</small>
    </main>
  );
}
