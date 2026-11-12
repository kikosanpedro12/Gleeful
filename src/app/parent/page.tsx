"use client";
import { useEffect, useState } from "react";
import { deleteProfile, loadProfile, skillStatus, SKILL_LABELS, type LearnerProfile } from "@/lib/learner/profile";
import { LOOKS } from "@/lib/teacher/rig";

const KIND: Record<string, string> = { not_seen: "Not started", learning: "Still learning", needs_check: "Needs a later check", independent: "Did it on their own later" };

/** Minimal parent view. Honest summary from recorded evidence only. */
export default function ParentPage() {
  const [p, setP] = useState<LearnerProfile | null>(null);
  useEffect(() => setP(loadProfile()), []);
  if (!p) return null;
  const skills = Array.from(new Set(p.attempts.map((a) => a.skill)));
  return (
    <main className="parent">
      <a href="/">← Back to the classroom</a>
      <h1>Parent view</h1>
      <p className="warn">Test version. This history is stored only in this browser on this device (no account yet). Lessons are scripted, not live AI.</p>
      <p>Sessions started: <b>{p.sessions}</b>{p.teacher ? <> · Teacher: <b>{LOOKS[p.teacher].name}</b></> : null}</p>
      <h2>What we have seen</h2>
      {!skills.length && <p>No answers recorded yet.</p>}
      {skills.map((skill) => {
        const st = skillStatus(p.attempts, skill);
        return (
          <section key={skill} className="skill">
            <h3>{SKILL_LABELS[skill] ?? skill}</h3>
            <p><b>{KIND[st.kind]}</b>{"detail" in st ? ` — ${st.detail}` : ""}</p>
            <ul>
              {p.attempts.filter((a) => a.skill === skill).map((a, i) => (
                <li key={i}>{new Date(a.at).toLocaleString()} · {a.context === "later_check" ? "later check, no hints" : "during the lesson"} · {a.correct ? "correct" : "not correct"}{a.hintsUsed ? ` · ${a.hintsUsed} hint${a.hintsUsed > 1 ? "s" : ""}` : ""}</li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="fine">We record answers and hints, not audio. One correct answer with help is not counted as mastery; a later no-hint check is what shows independent understanding.</p>
      <button className="danger" onClick={() => { if (confirm("Delete all learning history on this device?")) { deleteProfile(); setP(loadProfile()); } }}>Delete history</button>
    </main>
  );
}
