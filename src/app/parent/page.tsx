import { redirect } from "next/navigation";
import { accountsAvailable } from "@/lib/supabase/env";
import { createServerSupabase } from "@/lib/supabase/server";
import { currentParentId } from "@/lib/auth/parent";
import { loadParentData } from "@/lib/auth/parentData";
import { MAX_LEARNERS_PER_PARENT } from "@/lib/auth/validate";
import { gradeLabel } from "@/lib/learner/grades";
import LocalHistory from "./LocalHistory";
import { AddLearnerForm, ConsentForm, LearnerCard, WithdrawForm } from "./ParentForms";

export const dynamic = "force-dynamic";

/**
 * Parent area. Accounts off (no Supabase settings): the same device-only history as before, with an honest
 * note. Accounts on: sign-in is required, then permission (consent), then the children's profiles.
 */
export default async function ParentPage() {
  if (!accountsAvailable()) return <LocalHistory standalone />;

  const supabase = await createServerSupabase();
  const parentId = supabase ? await currentParentId(supabase) : null;
  if (!supabase || !parentId) redirect("/sign-in?next=/parent");

  const data = await loadParentData(supabase, parentId);
  return (
    <main className="parent">
      <a href="/learn">← Back to the classroom</a>
      <h1>Parent area</h1>
      <form action="/auth/sign-out" method="post"><button className="ghost" type="submit">Sign out</button></form>

      {!data.ok ? (
        <p className="warn" role="alert" data-testid="parent-not-ready">Accounts are switched on, but the family database isn&apos;t ready yet, so children and permission can&apos;t be saved. Nothing is wrong with your account. Please try again later.</p>
      ) : (
        <>
          <h2>Permission</h2>
          {data.consent ? (
            <>
              <p data-testid="consent-given">You gave permission on <b>{new Date(data.consent.acceptedAt).toLocaleDateString()}</b>. The AI teacher can answer your children&apos;s messages while you are signed in on this device.</p>
              <WithdrawForm />
            </>
          ) : (
            <ConsentForm />
          )}

          <h2>Your children</h2>
          {data.learners.length === 0 && <p>No children added yet.</p>}
          {data.learners.map((l) => (
            <div key={l.id}>
              <h3>{l.nickname} · {gradeLabel(l.grade)}</h3>
              <LearnerCard id={l.id} nickname={l.nickname} grade={l.grade} teacher={l.preferred_teacher} />
            </div>
          ))}
          {data.learners.length < MAX_LEARNERS_PER_PARENT && <AddLearnerForm canAdd={data.consent !== null} />}
        </>
      )}

      <LocalHistory standalone={false} />
    </main>
  );
}
