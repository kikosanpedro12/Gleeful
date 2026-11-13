"use client";
import { useEffect, useState } from "react";
import { skillStatus, skillLabel, type LearnerProfile } from "@/lib/learner/profile";
import { learnerStore } from "@/lib/learner/store";
import { LOOKS } from "@/lib/teacher/rig";

const KIND: Record<string, string> = { not_seen: "Not started", learning: "Still learning", needs_check: "Needs a check on another day", independent: "Did it on their own in a later session" };
const CONTEXT: Record<string, string> = { taught: "during the lesson", recheck: "no-hint check, same session", later_check: "no-hint check, later session" };

/** Minimal parent view. Honest summary from recorded evidence only. */
export default function ParentPage() {
  const [p, setP] = useState<LearnerProfile | null>(null);
  useEffect(() => { void learnerStore.load().then(setP); }, []);
  if (!p) return null;
  const skills = Array.from(new Set(p.attempts.map((a) => a.skill)));
  return (
    <main className="parent">
      <a href="/learn">← Back to the classroom</a>
      <h1>Parent view</h1>
      <p className="warn">Test version. Where this history is stored: <b>{learnerStore.label}</b>. Lessons are scripted, not live AI.</p>
      <p>Sessions started: <b>{p.sessions}</b>{p.teacher ? <> · Teacher: <b>{LOOKS[p.teacher].name}</b></> : null}</p>
      <h2>What we have seen</h2>
      {!skills.length && <p>No answers recorded yet.</p>}
      {skills.map((skill) => {
        const st = skillStatus(p.attempts, skill);
        return (
          <section key={skill} className="skill">
            <h3>{skillLabel(skill)}</h3>
            <p><b>{KIND[st.kind]}</b>{"detail" in st ? ` — ${st.detail}` : ""}</p>
            <ul>
              {p.attempts.filter((a) => a.skill === skill).map((a, i) => (
                <li key={i}>{new Date(a.at).toLocaleString()} · {CONTEXT[a.context] ?? a.context} · {a.correct ? "correct" : "not correct"}{a.hintsUsed ? ` · ${a.hintsUsed} hint${a.hintsUsed > 1 ? "s" : ""}` : ""}</li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="fine">We record answers and hints, not audio. One correct answer with help is not counted as mastery. Only a no-hint check in a later session counts as doing it on their own.</p>
      <button className="danger" onClick={() => { if (confirm("Delete all learning history on this device?")) { void learnerStore.deleteAll().then(() => learnerStore.load()).then(setP); } }}>Delete history</button>
    </main>
  );
}
