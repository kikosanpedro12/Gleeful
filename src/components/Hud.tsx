"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session/store";
import { session } from "@/lib/session/controller";
import { LOOKS, type TeacherId } from "@/lib/teacher/rig";
import { WORLDS } from "@/lib/worlds/registry";
import { playPreview, stopPreview } from "@/lib/voice/preview";
import { actors } from "./scene/TeacherActor";

const TEACHERS: TeacherId[] = ["leo", "mia"];

function Onboarding() {
  const teacher = useSession((s) => s.teacher);
  const previewing = useSession((s) => s.previewing);
  const status = useSession((s) => s.status);
  const pick = (id: TeacherId) => {
    session.chooseTeacher(id);
    void playPreview(id, () => actors[id]?.animator.gestureNow("wave"));
  };
  return (
    <div className="start" data-testid="onboarding">
      <h1>Choose your teacher</h1>
      <p>Leo and Mia are AI teachers. Tap one to hear them.</p>
      <div className="pick">
        {TEACHERS.map((id) => (
          <button key={id} className={`teacher-card ${id} ${teacher === id ? "on" : ""}`} data-testid={`pick-${id}`} onClick={() => pick(id)} aria-pressed={teacher === id}>
            <span className="swatch" aria-hidden />
            <b>{LOOKS[id].name}</b>
            <small>{previewing === id ? "🔊 Saying hi…" : "▶ Hear me"}</small>
          </button>
        ))}
      </div>
      <button className="primary" data-testid="start" disabled={!teacher || status === "connecting"} onClick={() => { stopPreview(); void session.start(); }}>
        {status === "connecting" ? "Getting ready…" : teacher ? `Start with ${LOOKS[teacher].name}` : "Pick a teacher"}
      </button>
      <small className="fine">
        Early test version: lessons are scripted, not live AI yet. No audio is recorded. Answers are saved in this browser only. When you tap the mic, your browser turns speech into text, and most browsers (Chrome, Edge, Safari) send that speech to their own service (Google, Microsoft or Apple) to do it.
      </small>
      <a className="fine link" href="/parent">For parents →</a>
    </div>
  );
}

function QuestionCard() {
  const q = useSession((s) => s.question);
  if (!q) return null;
  const def = WORLDS[q.world].questions[q.id];
  if (!def) return null;
  return (
    <div className="question" data-testid="question" role="group" aria-label={def.prompt}>
      <p>{def.prompt}</p>
      <div className="opts">
        {def.options.map((o) => (
          <button key={o.id} data-testid={`answer-${o.id}`} onClick={() => session.answer(o.id)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

function InspectCard() {
  const inspecting = useSession((s) => s.inspecting);
  const world = useSession((s) => s.world);
  const w = WORLDS[world];
  const item = inspecting ? w.interactive[inspecting] : null;
  if (!item) return null;
  const src = w.sources.find((x) => item.inspect.factIds.some((f) => w.facts.find((ff) => ff.id === f)?.sourceId === x.id));
  return (
    <aside className="inspect" data-testid="inspect">
      <small>LOOK CLOSER</small>
      <b>{item.inspect.title}</b>
      <p>{item.inspect.body}</p>
      {item.inspect.hint && <p className="hint">{item.inspect.hint}</p>}
      {src && <a href={src.url} target="_blank" rel="noreferrer">Source: {src.title}</a>}
      <button className="ghost small" onClick={() => session.closeInspect()}>Put it back</button>
    </aside>
  );
}

function SourcesButton() {
  const world = useSession((s) => s.world);
  const [open, setOpen] = useState(false);
  const w = WORLDS[world];
  if (!w.sources.length) return null;
  return (
    <>
      <button className="ghost" aria-label="Where these facts come from" onClick={() => setOpen((v) => !v)}>ⓘ</button>
      {open && (
        <div className="sources" role="dialog" aria-label="Sources">
          <b>Where these facts come from</b>
          {w.sources.map((s) => <a key={s.id} href={s.url} target="_blank" rel="noreferrer">{s.title}</a>)}
          <small>Fact check status: {w.reviewStatus}.</small>
          <button className="ghost small" onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
    </>
  );
}

const STATE_LABEL: Record<string, string> = { offline: "", idle: "", listening: "Listening…", thinking: "Thinking…", speaking: "" };

export default function Hud() {
  const status = useSession((s) => s.status);
  const conv = useSession((s) => s.conv);
  const banner = useSession((s) => s.banner);
  const micAvailable = useSession((s) => s.micAvailable);
  const listening = useSession((s) => s.listening);
  const interim = useSession((s) => s.interim);
  const transcript = useSession((s) => s.transcript);
  const caption = useSession((s) => s.caption);
  const choices = useSession((s) => s.choices);
  const world = useSession((s) => s.world);
  const transit = useSession((s) => s.transit);
  const teacher = useSession((s) => s.teacher);
  const [typing, setTyping] = useState(false);
  const [showWords, setShowWords] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const live = status === "connected";
  const name = teacher ? LOOKS[teacher].name : "Teacher";
  const notice = transit ? WORLDS[transit.to].simulationNotice : WORLDS[world].simulationNotice;

  useEffect(() => { if (typing) inputRef.current?.focus(); }, [typing]);
  useEffect(() => {
    if (banner?.kind !== "info") return;
    const t = setTimeout(() => useSession.setState((s) => (s.banner === banner ? { banner: null } : {})), 6000);
    return () => clearTimeout(t);
  }, [banner]);

  const lastTeacher = [...transcript].reverse().find((l) => l.role === "teacher");
  const submit = (e: React.FormEvent) => { e.preventDefault(); session.sendText(text); setText(""); };
  const busy = conv.state === "speaking" || conv.state === "thinking";

  return (
    <div className="hud">
      <span id="tap-tag" className="tag" style={{ display: "none" }} aria-hidden>👆 Tap to investigate</span>
      <header className="top">
        {live && <span className="chip wide-only">{name} · AI teacher</span>}
        {live && (process.env.NEXT_PUBLIC_BRAIN === "model"
          ? <span className="chip demo" data-testid="demo-badge" title="Powered by Claude, an AI. If it cannot be reached, a built-in script answers instead. Test build."><span className="wide-only">AI teacher · test build</span><span className="narrow-only">AI · test</span></span>
          : <span className="chip demo" data-testid="demo-badge" title="Lessons are scripted for testing; not live AI yet"><span className="wide-only">Scripted lesson · not AI yet</span><span className="narrow-only">Scripted · not AI</span></span>)}
        {live && notice && <span className="chip sim" data-testid="sim-badge" title={notice}><span className="wide-only">{notice}</span><span className="narrow-only">Simulation</span></span>}
        <span className="grow" />
        {live && (
          <>
            <SourcesButton />
            <button className="ghost" onClick={() => setShowWords((v) => !v)} aria-pressed={showWords} aria-label="Show words"><span className="wide-only">Words</span><span className="narrow-only">💬</span></button>
            <button className="ghost" onClick={() => session.stop()} aria-label="End lesson"><span className="wide-only">End</span><span className="narrow-only">✕</span></button>
          </>
        )}
      </header>

      {banner && (
        <div className={`banner ${banner.kind}`} role="status">
          {banner.text}
          <button aria-label="Dismiss" onClick={() => useSession.setState({ banner: null })}>×</button>
        </div>
      )}

      {!live && <Onboarding />}
      {live && <InspectCard />}

      {live && (
        <footer className="bottom">
          {showWords && (
            <div className="words" aria-live="polite">
              {transcript.slice(-6).map((l) => (
                <p key={l.id} className={l.role}><b>{l.role === "child" ? "You" : name}:</b> {l.text}</p>
              ))}
            </div>
          )}
          {!showWords && caption && conv.state === "speaking" && lastTeacher?.turnId === conv.turnId && (
            <div className="caption" aria-live="polite" data-testid="caption">{caption}</div>
          )}
          {listening && <div className="caption you" data-testid="interim">{interim || "I'm listening…"}</div>}
          <QuestionCard />
          {choices.length > 0 && !busy && (
            <div className="choices" data-testid="choices">
              {choices.map((c) => <button key={c.id} data-testid={`choice-${c.id}`} onClick={() => session.choose(c.id)}>{c.label}</button>)}
            </div>
          )}
          <div className="state" data-testid="state" data-state={conv.state} data-world={world} data-transit={transit ? "1" : "0"}>{STATE_LABEL[conv.state]}</div>
          <div className="controls">
            {busy && <button className="ghost stop" data-testid="interrupt" onClick={() => session.interrupt()}>✋ Stop</button>}
            <button
              className={`mic ${listening ? "listening" : ""}`}
              data-testid="mic"
              disabled={!micAvailable}
              onClick={() => session.talk()}
              aria-label={listening ? "Stop listening" : micAvailable ? `Tap and talk to ${name}` : "Voice input not available"}
            >
              {micAvailable ? (listening ? "●" : "🎤") : "🚫"}
            </button>
            <button className="ghost" onClick={() => setTyping((v) => !v)} aria-pressed={typing}>⌨️</button>
          </div>
          {typing && (
            <form className="type" onSubmit={submit}>
              <input ref={inputRef} data-testid="text-input" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder={`Type to ${name}…`} />
              <button className="primary small" type="submit">Send</button>
            </form>
          )}
        </footer>
      )}
    </div>
  );
}
