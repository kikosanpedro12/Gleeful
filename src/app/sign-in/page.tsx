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
      <SignInForm next={next} />
      <small className="fine">Early-access version. <a href="/privacy">Privacy notice</a>.</small>
    </main>
  );
}
