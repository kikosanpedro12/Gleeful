"use client";
import { useEffect, useRef, useState } from "react";
import { getTesterCode, TESTER_HEADER } from "@/lib/brain/tester";
import { BRAIN_ENDPOINT, type BrainRequest } from "@/lib/brain/protocol";
import { SAFETY_CASES, judge, type SafetyVerdict } from "@/lib/safety/cases";

/**
 * Private: runs the child-safety check set against the live AI teacher (needs the tester passcode in this tab).
 * About 16 short AI turns (a few cents). Each reply is shown in full: the rules only catch obvious red flags.
 * Nothing is saved; results stay on this screen.
 */
type Row = { status: "waiting" | "running" | "done" | "error"; reply?: string; verdict?: SafetyVerdict; error?: string; model?: string };
const GAP_MS = 3500; // stay well under the per-session and per-address rate limits

export default function SafetyPage() {
  const [code, setCode] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>(() => SAFETY_CASES.map(() => ({ status: "waiting" })));
  const [running, setRunning] = useState(false);
  const stop = useRef(false);
  useEffect(() => { setCode(getTesterCode()); return () => { stop.current = true; }; }, []);

  const set = (i: number, r: Row) => setRows((all) => all.map((x, k) => (k === i ? r : x)));
  async function run() {
    if (!code || running) return;
    setRunning(true);
    stop.current = false;
    setRows(SAFETY_CASES.map(() => ({ status: "waiting" })));
    for (let i = 0; i < SAFETY_CASES.length && !stop.current; i++) {
      const c = SAFETY_CASES[i];
      set(i, { status: "running" });
      const req: BrainRequest = {
        v: 1, learnerId: "safety_check", sessionId: `safety_${Date.now().toString(36)}_${i}`, tz: "Asia/Manila", world: "classroom",
        teacher: "leo", session: 1, input: { kind: "text", text: c.text }, hintsUsed: 0, history: [], skills: [],
      };
      try {
        const r = await fetch(BRAIN_ENDPOINT, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", [TESTER_HEADER]: code }, body: JSON.stringify(req) });
        const j = (await r.json().catch(() => ({}))) as { segments?: { say?: unknown }[]; model?: string; error?: string };
        if (!r.ok) set(i, { status: "error", error: `${r.status} ${typeof j.error === "string" ? j.error : ""}` });
        else {
          const reply = (j.segments ?? []).map((s) => (typeof s.say === "string" ? s.say : "")).join(" ").trim();
          set(i, { status: "done", reply, verdict: judge(c, reply), model: j.model });
        }
      } catch { set(i, { status: "error", error: "network" }); }
      if (i < SAFETY_CASES.length - 1) await new Promise((r) => setTimeout(r, GAP_MS));
    }
    setRunning(false);
  }

  const done = rows.filter((r) => r.status === "done");
  const flagged = done.filter((r) => !r.verdict?.ok).length;
  const errors = rows.filter((r) => r.status === "error").length;
  const summary = SAFETY_CASES.map((c, i) => {
    const r = rows[i];
    return `${r.status === "done" ? (r.verdict?.ok ? "OK  " : "FLAG") : r.status.toUpperCase()} ${c.label}: ${r.reply ?? r.error ?? ""}${r.verdict && !r.verdict.ok ? ` [${r.verdict.problems.join("; ")}]` : ""}`;
  }).join("\n");

  return (
    <main className="tester safety">
      <h1>AI safety check</h1>
      <p>Sends {SAFETY_CASES.length} things a child might say to the live AI teacher, one at a time, and shows each answer. Takes about a minute and costs a few cents.</p>
      {!code ? (
        <p className="vlab-note">Enter the tester passcode on <a href="/tester">/tester</a> first (same tab), then come back.</p>
      ) : (
        <div className="vlab-actions">
          <button className="primary" data-testid="safety-run" disabled={running} onClick={() => void run()}>{running ? "Running…" : "Run the safety check"}</button>
          {running && <button className="ghost" onClick={() => { stop.current = true; }}>Stop</button>}
        </div>
      )}
      {done.length > 0 && (
        <p role="status" data-testid="safety-summary"><b>{done.length - flagged} OK · {flagged} flagged · {errors} errors</b>. OK only means no red flag was found: read every answer.</p>
      )}
      <ol className="safety-list">
        {SAFETY_CASES.map((c, i) => {
          const r = rows[i];
          return (
            <li key={c.id} data-testid={`safety-${c.id}`} data-status={r.status === "done" ? (r.verdict?.ok ? "ok" : "flag") : r.status}>
              <b>{r.status === "done" ? (r.verdict?.ok ? "✓ " : "⚠ ") : r.status === "error" ? "✕ " : ""}{c.label}</b>
              <div className="fine">Child: “{c.text}”</div>
              {r.reply !== undefined && <div>Teacher: “{r.reply}”</div>}
              {r.verdict && !r.verdict.ok && <div className="vlab-note">{r.verdict.problems.join("; ")}</div>}
              {r.error && <div className="vlab-note">Error: {r.error}</div>}
            </li>
          );
        })}
      </ol>
      {done.length > 0 && !running && (
        <button className="ghost" onClick={() => void navigator.clipboard.writeText(summary).catch(() => {})}>Copy results</button>
      )}
      <small className="fine">Nothing is saved. The test lines go to the AI service like any lesson turn.</small>
    </main>
  );
}
