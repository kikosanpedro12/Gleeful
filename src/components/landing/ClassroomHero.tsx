"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import StoryPanel from "@/components/StoryPanel";
import { useSession } from "@/lib/session/store";
import { session } from "@/lib/session/controller";
import { parseFrame } from "@/lib/scene/frame";
import { elevenAvailable, probeVoice, speakElevenLine, type ElevenLine } from "@/lib/voice/elevenSpeak";
import { primeAudio } from "@/lib/voice/elevenPlayer";
import { TASTE_ENDPOINT, TASTE_MAX_INPUT, TASTE_MAX_TURNS, type TasteRequest } from "@/lib/taste/protocol";

const Stage = dynamic(() => import("@/components/Stage"), { ssr: false });

type Teacher = "leo" | "mia";
type Line = { role: "visitor" | "teacher"; text: string };
type Phase = "checking" | "live" | "unavailable";
const IDEAS = ["Why is Mars red?", "How did Rizal live?", "What is 12 divided by 3?"];
const randomId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : Math.random().toString(36).slice(2).padEnd(12, "x"));

function hasWebgl() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

/**
 * The landing IS the classroom: the visitor picks Leo or Mia, then gets TASTE_MAX_TURNS live-feeling tries (voice when the
 * server offers it, a pretend picture on the chalkboard), then the paywall. Honesty: the page says when the live AI is
 * off; nothing is faked. The per-person count lives in a signed cookie on the server (a refresh does not reset it).
 */
export default function ClassroomHero() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [used, setUsed] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState(false);
  const [webgl, setWebgl] = useState(false);
  const [over, setOver] = useState(false);
  const id = useRef(randomId());
  const voice = useRef<ElevenLine | null>(null);
  const flash = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busyNote, setBusyNote] = useState(false);

  useEffect(() => {
    setWebgl(hasWebgl());
    void probeVoice();
    const ctl = new AbortController();
    (async () => {
      try {
        const r = await fetch(TASTE_ENDPOINT, { cache: "no-store", credentials: "same-origin", signal: ctl.signal });
        const j = (await r.json()) as { available?: unknown; used?: unknown };
        const u = typeof j.used === "number" ? Math.max(0, Math.min(TASTE_MAX_TURNS, j.used)) : 0;
        setUsed(u);
        if (u >= TASTE_MAX_TURNS) setOver(true);
        setPhase(j.available === true || u >= TASTE_MAX_TURNS ? "live" : "unavailable");
      } catch { setPhase("unavailable"); }
    })();
    return () => { if (timer.current) clearTimeout(timer.current); ctl.abort(); voice.current?.stop(); session.closeScene(); useSession.setState({ status: "disconnected", teacher: null }); };
  }, []);

  /** Only the chosen tutor stays on stage. Status is set on the store directly: no lesson provider runs on the landing. */
  function pick(t: Teacher) { setTeacher(t); setTimeout(() => document.getElementById("class-q")?.focus({ preventScroll: true }), 50); session.chooseTeacher(t); useSession.setState({ status: "connected", world: "classroom", boardText: "Ask me anything!" }); }

  async function send(raw: string) {
    const q = raw.trim();
    if (!q || busy || !teacher || used >= TASTE_MAX_TURNS) return;
    setBusy(true); setTrouble(false); voice.current?.stop();
    if (elevenAvailable()) primeAudio();
    const body: TasteRequest = { v: 1, tasteId: id.current, text: q, teacher, history: lines.slice(-4) };
    try {
      const res = await fetch(TASTE_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
      if (res.ok) {
        const j = (await res.json()) as { reply?: unknown; turnsLeft?: unknown; scene?: unknown };
        if (typeof j.reply !== "string" || !j.reply) throw new Error("empty");
        const reply = j.reply;
        setLines((l) => [...l, { role: "visitor", text: q }, { role: "teacher", text: reply }]);
        const left = typeof j.turnsLeft === "number" ? Math.max(0, Math.min(TASTE_MAX_TURNS, j.turnsLeft)) : 0;
        setUsed(TASTE_MAX_TURNS - left);
        setText("");
        const f = j.scene ? parseFrame(j.scene) : null; // the browser re-checks: our own ids only
        if (f?.ok) useSession.setState({ scene: { id: Date.now(), frame: f.frame } }); else session.closeScene();
        const code = elevenAvailable();
        if (code) voice.current = speakElevenLine(reply, teacher, code, { onFirstSound: () => {}, onEnd: () => {}, onFail: () => {} });
        if (left <= 0) timer.current = setTimeout(() => setOver(true), 12000);
      } else if (res.status === 429 || res.status === 503) {
        const err = (await res.json().catch(() => ({}))) as { error?: unknown };
        if (err.error === "rate_limited") setTrouble(true); else if (err.error === "taste_over") { setUsed(TASTE_MAX_TURNS); setOver(true); } else setBusyNote(true);
      } else setTrouble(true);
    } catch { setTrouble(true); } finally { setBusy(false); }
  }

  const last = [...lines].reverse().find((l) => l.role === "teacher");
  const name = teacher === "mia" ? "Mia" : teacher === "leo" ? "Leo" : null;

  return (
    <section className="lp-class" aria-labelledby="class-h">
      <div className="lp-class-stage" aria-hidden>
        {webgl ? <Stage flash={flash} /> : <div className="lp-class-still" />}
        <div ref={flash} className="flash" aria-hidden />
      </div>
      <div className="lp-class-ui">
        <div className="lp-class-head">
          <h1 id="class-h" className="lp-class-h">{name ? `Ask ${name} anything.` : "Meet your tutor."}</h1>
          {!name && <p className="lp-class-sub">A real AI tutor for kids. Pick one and ask away.</p>}
        </div>

        {phase === "unavailable" && (
          <div className="lp-card" data-testid="taste-unavailable">
            <p className="lp-tag">The live tutor is resting</p>
            <p>The live AI is switched off right now. You can still open the scripted demo lesson, which is not AI.</p>
            <a className="lp-btn lp-btn-main" href="/learn">Open the demo lesson</a>
          </div>
        )}

        {phase === "live" && !over && !teacher && (
          <div className="lp-card" data-testid="choose-teacher">
            <p className="lp-tag lp-tag-live"><span aria-hidden className="lp-dot" /> Live AI tutor · 3 free tries</p>
            <p>Choose who teaches you today.</p>
            <div className="lp-pick">
              <button type="button" className="lp-btn lp-btn-main" onClick={() => pick("leo")} data-testid="pick-leo">Leo</button>
              <button type="button" className="lp-btn lp-btn-main" onClick={() => pick("mia")} data-testid="pick-mia">Mia</button>
            </div>
          </div>
        )}

        {phase === "live" && !over && teacher && (
          <div className="lp-card" data-testid="taste-live" ref={cardRef}>
            <div className="lp-say" aria-live="polite" aria-atomic="true">
              {busy ? <p data-testid="taste-thinking" className="lp-wait">{name} is thinking…</p>
                : last ? <p data-testid="taste-reply"><b>{name}:</b> {last.text}</p>
                : <p className="lp-wait">Hi! I&apos;m {name}, an AI tutor. What are you curious about?</p>}
            </div>
            <div className="lp-chips" role="group" aria-label="Question ideas">
              {IDEAS.map((i) => <button key={i} type="button" className="lp-chip" disabled={busy} onClick={() => void send(i)}>{i}</button>)}
            </div>
            <form className="lp-taste-row" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
              <label className="lp-sr" htmlFor="class-q">Your question</label>
              <input id="class-q" className="lp-taste-input" type="text" autoComplete="off" enterKeyHint="send" maxLength={TASTE_MAX_INPUT}
                value={text} onChange={(e) => setText(e.target.value)} placeholder={`Ask ${name}…`} disabled={busy} />
              <button className="lp-btn lp-btn-main" type="submit" disabled={busy || !text.trim()}>Ask</button>
            </form>
            <p className="lp-taste-meta" data-testid="taste-count">
              {Array.from({ length: TASTE_MAX_TURNS }, (_, i) => <span key={i} className={i < used ? "lp-pip lp-pip-on" : "lp-pip"} aria-hidden />)}
              <span>{used} of {TASTE_MAX_TURNS} used · it&apos;s an AI and can be wrong. Please don&apos;t type private details.</span>
            </p>
            {busyNote && <p className="lp-taste-err" role="status">The tutor is busy right now. Please try again a little later.</p>}
            {trouble && <p className="lp-taste-err" role="status">{name} didn&apos;t hear that. Wait a moment and try again.</p>}
          </div>
        )}

        {over && (
          <div className="lp-card lp-paywall" data-testid="paywall" role="region" aria-label="Keep learning" tabIndex={-1} ref={(el) => { el?.focus({ preventScroll: true }); }}>
            <h2 className="lp-paywall-h">{name ?? "Your tutor"} has so much more to show you.</h2>
            <p>Keep going with the same tutor: live voice, pictures on the board, and a parent view of what stuck.</p>
            <a className="lp-btn lp-btn-main" href="/sign-in" data-testid="start-trial">Start 7-day free trial</a>
            <p className="lp-fine-print">Nothing is charged today. Payments are not switched on yet.</p>
            <a className="lp-link" href="/pricing">See pricing</a>
          </div>
        )}
      </div>
      <div className="lp-board" aria-live="polite"><StoryPanel /></div>
    </section>
  );
}
