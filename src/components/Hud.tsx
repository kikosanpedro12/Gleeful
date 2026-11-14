"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session/store";
import { session } from "@/lib/session/controller";
import { LOOKS, type TeacherId } from "@/lib/teacher/rig";
import { WORLDS } from "@/lib/worlds/registry";
import { MODEL_BUILD } from "@/lib/brain/mode";
import { probeBrain, useReach } from "@/lib/brain/reach";
import { playPreview, stopPreview } from "@/lib/voice/preview";
import { actors } from "./scene/TeacherActor";
import WidgetPanel from "./WidgetPanel";

const TEACHERS: TeacherId[] = ["leo", "mia"];

/* Icons are inline SVG (not emoji) so they look the same on every phone. */
const Icon = {
  mic: <svg viewBox="0 0 24 24" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8.5 21h7" fill="none" /></svg>,
  send: <svg viewBox="0 0 24 24" aria-hidden><rect x="6.5" y="6.5" width="11" height="11" rx="2.5" /></svg>,
  keys: <svg viewBox="0 0 24 24" aria-hidden><rect x="3" y="6" width="18" height="12" rx="3" fill="none" /><path d="M7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M8 14h8" fill="none" /></svg>,
  hand: <svg viewBox="0 0 24 24" aria-hidden><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>,
  words: <svg viewBox="0 0 24 24" aria-hidden><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4 3.5V16h0a2 2 0 0 1-2-2z" fill="none" /><path d="M8 9h8M8 12h5" fill="none" /></svg>,
  close: <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" fill="none" /></svg>,
  info: <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="8.5" fill="none" /><path d="M12 11v5M12 8h.01" fill="none" /></svg>,
};

/**
 * Start screen. AI wording follows `useReach().ai` (can THIS visitor reach the AI:
 * key + switched on + tester code when the gate is on), never the build flag alone.
 */
function Onboarding() {
  const ai = useReach((s) => s.ai);
  useEffect(() => { if (MODEL_BUILD) void probeBrain(); }, []);
  return <OnboardingView ai={ai} />;
}

/** The start screen itself; `ai` = can this visitor reach the AI (see reach.ts). Exported for the honesty test. */
export function OnboardingView({ ai }: { ai: boolean }) {
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
      <p>{ai ? "Leo and Mia are AI teachers. Tap one to hear them say hi." : "Tap Leo or Mia to hear them say hi."}</p>
      <div className="pick">
        {TEACHERS.map((id) => (
          <button key={id} className={`teacher-card ${id} ${teacher === id ? "on" : ""}`} data-testid={`pick-${id}`} onClick={() => pick(id)} aria-pressed={teacher === id}>
            <span className="swatch" aria-hidden />
            <b>{LOOKS[id].name}</b>
            <small>{previewing === id ? "Saying hi…" : teacher === id ? "Picked" : "Tap to hear"}</small>
          </button>
        ))}
      </div>
      <button className="primary" data-testid="start" disabled={!teacher || status === "connecting"} onClick={() => { stopPreview(); void session.start(); }}>
        {status === "connecting" ? "Getting ready…" : teacher ? `Start with ${LOOKS[teacher].name}` : "Pick a teacher"}
      </button>
      <small className="fine">
        {ai
          ? "Test version: answers come from an AI (Claude) when it can be reached, and from a scripted lesson when it can't. AI can make mistakes. "
          : "Test version: the lessons are scripted, not AI yet. "}
        Nothing is recorded, and answers stay in this browser. When you use the mic, your browser sends your speech to its own service (Google, Microsoft or Apple) to turn it into text.
      </small>
      <a className="fine link" href="/parent">For parents</a>
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
      <small>Look closer</small>
      <b>{item.inspect.title}</b>
      <p>{item.inspect.body}</p>
      {item.inspect.hint && <p className="hint">{item.inspect.hint}</p>}
      {src && <a href={src.url} target="_blank" rel="noreferrer">Source: {src.title}</a>}
      <button className="ghost small inspect-close" onClick={() => session.closeInspect()} aria-label="Put it back">Put it back</button>
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
      <button className="ghost icon" aria-label="Where these facts come from" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{Icon.info}</button>
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

/** The mic's glow follows the child's voice while listening (a CSS variable, no re-renders). */
function useVoiceGlow(listening: boolean) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!listening) { el.style.setProperty("--lvl", "0"); return; }
    let raf = 0, lvl = 0;
    const tick = () => {
      const target = Math.min(1, session.inputLevel() * 8);
      lvl += (target - lvl) * 0.25;
      el.style.setProperty("--lvl", lvl.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [listening]);
  return ref;
}

const STATE_LABEL: Record<string, string> = { offline: "", idle: "", listening: "Listening", thinking: "Thinking", speaking: "Speaking" };

export default function Hud() {
  const brainKind = useSession((s) => s.brainKind);
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
  const [infoOpen, setInfoOpen] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const micRef = useVoiceGlow(listening);
  const live = status === "connected";
  const name = teacher ? LOOKS[teacher].name : "Teacher";
  const notice = transit ? WORLDS[transit.to].simulationNotice : WORLDS[world].simulationNotice;

  useEffect(() => { if (typing) inputRef.current?.focus(); }, [typing]);
  useEffect(() => {
    if (banner?.kind !== "info") return;
    const t = setTimeout(() => useSession.setState((s) => (s.banner === banner ? { banner: null } : {})), 6000);
    return () => clearTimeout(t);
  }, [banner]);
  // Model builds: say so, once, when the AI could not answer and the script took over.
  const aiReach = useReach((s) => s.ai);
  const toldFallback = useRef(false);
  const lastKind = useRef(brainKind);
  useEffect(() => {
    if (aiReach && live && brainKind === "scripted" && lastKind.current !== "scripted" && !toldFallback.current) {
      toldFallback.current = true;
      useSession.setState({ banner: { kind: "info", text: `${name} can't reach the AI right now, so this part is the scripted lesson. You can keep going.` } });
    }
    lastKind.current = brainKind;
  }, [brainKind, live, name, aiReach]);
  useEffect(() => { if (!live) { setTyping(false); setShowWords(false); setInfoOpen(false); toldFallback.current = false; } }, [live]);

  const lastTeacher = [...transcript].reverse().find((l) => l.role === "teacher");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    session.sendText(text);
    setText("");
    setTyping(false); // give the screen back to the teacher
  };
  const busy = conv.state === "speaking" || conv.state === "thinking";
  const thinking = conv.state === "thinking";
  const showCaption = !showWords && !!caption && conv.state === "speaking" && lastTeacher?.turnId === conv.turnId;

  return (
    <div className={`hud ${teacher ?? ""}`}>
      <span id="tap-tag" className="tag" style={{ display: "none" }} aria-hidden>Tap to look closer</span>
      <header className="top">
        {live && (
          <button
            className={`chip badge ${brainKind === "model" ? "ai" : "demo"}`} data-testid="demo-badge" aria-expanded={infoOpen} aria-controls="badge-info"
            aria-label={`${name}: ${brainKind === "model" ? "AI" : "scripted, not AI"}${notice ? ", simulation" : ""}. Tap for details.`}
            onClick={() => setInfoOpen((v) => !v)}
          >
            <span>{name} · {brainKind === "model" ? "AI" : "Scripted, not AI"}</span>
            {notice && <span className="sim-tag" data-testid="sim-badge"> · Simulation</span>}
            <span className="i" aria-hidden>i</span>
          </button>
        )}
        <span className="grow" />
        {live && (
          <>
            <SourcesButton />
            <button className="ghost icon" onClick={() => setShowWords((v) => !v)} aria-pressed={showWords} aria-label={showWords ? "Hide the words" : "Show the words"}>{Icon.words}</button>
            <button className="ghost icon" onClick={() => session.stop()} aria-label="End lesson">{Icon.close}</button>
          </>
        )}
      </header>

      {banner && (
        <div className={`banner ${banner.kind}`} role="status">
          {banner.text}
          <button aria-label="Dismiss" onClick={() => useSession.setState({ banner: null })}>{Icon.close}</button>
        </div>
      )}

      {live && infoOpen && (
        <div className="badge-info" id="badge-info" role="region" aria-label="About this lesson" data-testid="badge-info">
          <p>{brainKind === "model"
            ? `${name} is an AI teacher (Claude). Test build: AI can make mistakes, and if it can't be reached a built-in script answers instead.`
            : `This part is a scripted lesson, not AI yet. ${name} only understands certain words.`}</p>
          {notice && <p>{notice}</p>}
          <button className="ghost small" onClick={() => setInfoOpen(false)}>Close</button>
        </div>
      )}

      {!live && <Onboarding />}
      {live && <InspectCard />}

      {live && (
        <footer className="bottom">
          {showWords && (
            <div className="words" aria-live="polite">
              {transcript.length === 0 && <p>Your conversation with {name} shows here.</p>}
              {transcript.slice(-6).map((l) => (
                <p key={l.id} className={l.role}><b>{l.role === "child" ? "You" : name}</b> {l.text}</p>
              ))}
            </div>
          )}
          {showCaption && <div className="caption" aria-live="polite" data-testid="caption"><b className="who">{name}</b><span className="say">{caption}</span></div>}
          {!showWords && thinking && !listening && (
            <div className="caption thinking" data-testid="thinking" aria-label={`${name} is thinking`}><b className="who">{name}</b><span className="dots" aria-hidden><i /><i /><i /></span></div>
          )}
          {listening && <div className="caption you" data-testid="interim"><b className="who">You</b><span className="say">{interim || "I'm listening. Tap the mic when you're done."}</span></div>}
          <WidgetPanel />
          <QuestionCard />
          {choices.length > 0 && !busy && (
            <div className="choices" data-testid="choices">
              {choices.map((c) => <button key={c.id} data-testid={`choice-${c.id}`} onClick={() => session.choose(c.id)}>{c.label}</button>)}
            </div>
          )}
          <div className="state" data-testid="state" data-state={conv.state} data-world={world} data-transit={transit ? "1" : "0"} role="status">{STATE_LABEL[conv.state]}</div>
          {typing && (
            <form className="type" onSubmit={submit}>
              <input
                ref={inputRef} data-testid="text-input" value={text} maxLength={500} enterKeyHint="send"
                onChange={(e) => setText(e.target.value)}
                onBlur={() => { if (!text.trim()) setTimeout(() => setTyping(false), 120); }}
                onKeyDown={(e) => { if (e.key === "Escape") setTyping(false); }}
                placeholder={`Type to ${name}…`} aria-label={`Type a message to ${name}`}
              />
              <button className="primary small" type="submit" disabled={!text.trim()}>Send</button>
            </form>
          )}
          <div className="controls">
            <div className="slot left">
              {busy && <button className="stop" data-testid="interrupt" onClick={() => session.interrupt()} aria-label={`Stop ${name}`}>{Icon.hand}<span>Stop</span></button>}
            </div>
            <button
              ref={micRef}
              className={`mic ${listening ? "listening" : ""} ${thinking ? "thinking" : ""}`}
              data-testid="mic"
              disabled={!micAvailable}
              onClick={() => session.talk()}
              aria-pressed={listening}
              aria-label={listening ? "Done talking" : micAvailable ? `Tap and talk to ${name}` : "Voice input not available"}
            >
              {micAvailable ? (listening ? Icon.send : Icon.mic) : <span className="nomic" aria-hidden>{Icon.mic}</span>}
            </button>
            <div className="slot right">
              <button className="ghost round" data-testid="type-toggle" onClick={() => setTyping((v) => !v)} aria-pressed={typing} aria-label={typing ? "Close the keyboard" : `Type to ${name} instead`}>{Icon.keys}</button>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
