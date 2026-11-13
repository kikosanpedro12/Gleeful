"use client";
import { useActionState } from "react";
import { addLearner, deleteLearner, giveConsent, updateLearner, withdrawConsent, type ActionResult } from "./actions";
import { CONSENT_CHECKBOX, CONSENT_POINTS, CONSENT_TITLE } from "@/lib/consent/text";
import { GRADES, gradeLabel } from "@/lib/learner/grades";
import { NICKNAME_MAX } from "@/lib/auth/validate";

type Act = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
function Note({ r }: { r: ActionResult | null }) {
  if (!r) return null;
  return <p className={r.ok ? "ok" : "warn"} role={r.ok ? "status" : "alert"}>{r.message}</p>;
}

export function ConsentForm() {
  const [res, act, pending] = useActionState<ActionResult | null, FormData>(giveConsent as Act, null);
  return (
    <form action={act} className="consent" data-testid="consent-form">
      <h3>{CONSENT_TITLE}</h3>
      <ul>{CONSENT_POINTS.map((p) => <li key={p}>{p}</li>)}</ul>
      <label className="check"><input type="checkbox" name="agree" required /> <span>{CONSENT_CHECKBOX}</span></label>
      <button className="primary" type="submit" disabled={pending}>{pending ? "Saving…" : "I agree"}</button>
      <Note r={res} />
    </form>
  );
}

export function WithdrawForm() {
  const [res, act, pending] = useActionState<ActionResult | null, FormData>(withdrawConsent as Act, null);
  return (
    <form action={act} onSubmit={(e) => { if (!confirm("Withdraw your permission? The AI tutor will be turned off for your family.")) e.preventDefault(); }}>
      <button className="ghost" type="submit" disabled={pending}>{pending ? "Working…" : "Withdraw permission"}</button>
      <Note r={res} />
    </form>
  );
}

function LearnerFields({ nickname = "", grade = 3, teacher = "leo", prefix }: { nickname?: string; grade?: number; teacher?: string; prefix: string }) {
  return (
    <>
      <label htmlFor={`${prefix}-nick`}>Nickname</label>
      <input id={`${prefix}-nick`} name="nickname" defaultValue={nickname} maxLength={NICKNAME_MAX} autoComplete="off" required />
      <label htmlFor={`${prefix}-grade`}>Grade</label>
      <select id={`${prefix}-grade`} name="grade" defaultValue={String(grade)}>
        {GRADES.map((g) => <option key={g} value={g}>{gradeLabel(g)}</option>)}
      </select>
      <label htmlFor={`${prefix}-teacher`}>Teacher</label>
      <select id={`${prefix}-teacher`} name="preferred_teacher" defaultValue={teacher}>
        <option value="leo">Leo</option>
        <option value="mia">Mia</option>
      </select>
    </>
  );
}

export function AddLearnerForm({ canAdd }: { canAdd: boolean }) {
  const [res, act, pending] = useActionState<ActionResult | null, FormData>(addLearner as Act, null);
  return (
    <form action={act} className="learner-form" data-testid="add-learner">
      <h3>Add a child</h3>
      <p className="fine">A nickname is enough. Please don&apos;t use a surname.</p>
      <fieldset disabled={!canAdd || pending}>
        <LearnerFields prefix="new" />
        <button className="primary" type="submit">{pending ? "Adding…" : "Add child"}</button>
      </fieldset>
      {!canAdd && <p className="fine">Give your permission above first.</p>}
      <Note r={res} />
    </form>
  );
}

export function LearnerCard({ id, nickname, grade, teacher }: { id: string; nickname: string; grade: number; teacher: string }) {
  const [saved, save, saving] = useActionState<ActionResult | null, FormData>(updateLearner as Act, null);
  const [gone, remove, removing] = useActionState<ActionResult | null, FormData>(deleteLearner as Act, null);
  return (
    <section className="skill">
      <form action={save} className="learner-form">
        <input type="hidden" name="id" value={id} />
        <LearnerFields prefix={id} nickname={nickname} grade={grade} teacher={teacher} />
        <button className="ghost" type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
        <Note r={saved} />
      </form>
      <form action={remove} onSubmit={(e) => { if (!confirm(`Delete ${nickname} and all of their lesson history? This cannot be undone.`)) e.preventDefault(); }}>
        <input type="hidden" name="id" value={id} />
        <button className="danger" type="submit" disabled={removing}>{removing ? "Deleting…" : `Delete ${nickname}`}</button>
        <Note r={gone} />
      </form>
    </section>
  );
}
