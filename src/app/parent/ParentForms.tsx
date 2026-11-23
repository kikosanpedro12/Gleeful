"use client";
import { useActionState, useState } from "react";
import { addLearner, deleteLearner, giveConsent, updateLearner, withdrawConsent, type ActionResult } from "./actions";
import { CONSENT_CHECKBOX, CONSENT_POINTS, CONSENT_TITLE } from "@/lib/consent/text";
import { GRADES, gradeLabel } from "@/lib/learner/grades";
import { NICKNAME_MAX } from "@/lib/auth/validate";
import { INTERESTS, MAX_INTERESTS, NAME_SAY_MAX } from "@/lib/learner/interests";

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

function InterestChips({ chosen, prefix }: { chosen: readonly string[]; prefix: string }) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(chosen));
  const full = picked.size >= MAX_INTERESTS;
  return (
    <fieldset className="interests">
      <legend>Interests (optional)</legend>
      <p className="fine" id={`${prefix}-int-hint`}>Pick up to {MAX_INTERESTS} things your child likes.</p>
      <p className={`fine int-count${full ? " full" : ""}`} aria-live="polite" data-testid="interest-count">
        {picked.size} of {MAX_INTERESTS} chosen.{full ? " Untick one to pick a different one." : ""}
      </p>
      <div className="chips" role="group" aria-describedby={`${prefix}-int-hint`}>
        {INTERESTS.map((i) => {
          const on = picked.has(i.id);
          return (
            <label key={i.id} className={`int-pick${on ? " on" : ""}${!on && full ? " locked" : ""}`}>
              <input type="checkbox" name="interests" value={i.id} checked={on} disabled={!on && full}
                onChange={(e) => setPicked((prev) => { const n = new Set(prev); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n; })} />
              <span>{i.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function LearnerFields({ nickname = "", grade = 3, teacher = "leo", interests = [], nameSay = "", prefix }: { nickname?: string; grade?: number; teacher?: string; interests?: readonly string[]; nameSay?: string; prefix: string }) {
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
      <label htmlFor={`${prefix}-say`}>How to say the name (optional)</label>
      <input id={`${prefix}-say`} name="name_say" defaultValue={nameSay} maxLength={NAME_SAY_MAX} autoComplete="off" aria-describedby={`${prefix}-say-hint`} pattern={"[A-Za-z][A-Za-z ' \\-]*"} title="Letters, spaces, hyphens and apostrophes only" />
      <p className="fine" id={`${prefix}-say-hint`}>Respell it the way it sounds, like GAD-dee. Letters, spaces, hyphens and apostrophes only.</p>
      <InterestChips chosen={interests} prefix={prefix} />
    </>
  );
}

export function AddLearnerForm({ canAdd }: { canAdd: boolean }) {
  const [res, act, pending] = useActionState<ActionResult | null, FormData>(addLearner as Act, null);
  return (
    <form action={act} className="learner-form" data-testid="add-learner">
      <h3>Add a child</h3>
      <p className="fine">A nickname is enough. Please don&apos;t use a surname. Interests and how to say the name are optional.</p>
      <fieldset disabled={!canAdd || pending}>
        <LearnerFields prefix="new" />
        <button className="primary" type="submit">{pending ? "Adding…" : "Add child"}</button>
      </fieldset>
      {!canAdd && <p className="fine">Give your permission above first.</p>}
      <Note r={res} />
    </form>
  );
}

export function LearnerCard({ id, nickname, grade, teacher, interests, nameSay }: { id: string; nickname: string; grade: number; teacher: string; interests: readonly string[]; nameSay: string | null }) {
  const [saved, save, saving] = useActionState<ActionResult | null, FormData>(updateLearner as Act, null);
  const [gone, remove, removing] = useActionState<ActionResult | null, FormData>(deleteLearner as Act, null);
  return (
    <section className="skill">
      <form action={save} className="learner-form">
        <input type="hidden" name="id" value={id} />
        <LearnerFields prefix={id} nickname={nickname} grade={grade} teacher={teacher} interests={interests} nameSay={nameSay ?? ""} />
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
