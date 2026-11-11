"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session/store";
import { session } from "@/lib/session/controller";

const STATE_LABEL: Record<string, string> = {
  offline: "", idle: "Your turn — say something", listening: "Listening…", thinking: "Thinking…", speaking: "Leo is talking",
};

export default function Hud() {
  const status = useSession((s) => s.status);
  const mode = useSession((s) => s.mode);
  const conv = useSession((s) => s.conv);
  const banner = useSession((s) => s.banner);
  const micAvailable = useSession((s) => s.micAvailable);
  const micEnabled = useSession((s) => s.micEnabled);
  const transcript = useSession((s) => s.transcript);
  const [typing, setTyping] = useState(false);
  const [showWords, setShowWords] = useState(false);
  const [text, setText] = useState("");
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const live = status === "connected";

  useEffect(() => { if (typing) inputRef.current?.focus(); }, [typing]);
  useEffect(() => {
    if (banner?.kind !== "info") return;
    const t = setTimeout(() => useSession.setState((s) => (s.banner === banner ? { banner: null } : {})), 7000);
    return () => clearTimeout(t);
  }, [banner]);
  useEffect(() => { if (banner?.text.includes("access code")) setNeedCode(true); }, [banner]);
  useEffect(() => { if (live && !micAvailable) setTyping(true); }, [live, micAvailable]);

  const lastTeacher = [...transcript].reverse().find((l) => l.role === "teacher");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    session.sendText(text);
    setText("");
  };

  return (
    <div className="hud">
      <header className="top">
        <span className="chip">Leo · AI teacher</span>
        {mode === "demo" && live && <span className="chip demo" data-testid="demo-badge">DEMO — scripted replies, not live AI</span>}
        {mode === "live" && live && <span className="chip live">Live</span>}
        <span className="grow" />
        {live && (
          <>
            <button className="ghost" onClick={() => setShowWords((v) => !v)} aria-pressed={showWords}>Words</button>
            <button className="ghost" onClick={() => session.stop()}>End</button>
          </>
        )}
      </header>

      {banner && (
        <div className={`banner ${banner.kind}`} role="status">
          {banner.text}
          <button aria-label="Dismiss" onClick={() => useSession.setState({ banner: null })}>×</button>
        </div>
      )}

      {!live && (
        <div className="start">
          <h1>Meet Leo</h1>
          <p>Leo is an AI teacher. Talk to him out loud, or type.</p>
          {needCode && (
            <input className="code" type="password" placeholder="Family access code" value={code} onChange={(e) => setCode(e.target.value)} />
          )}
          <button className="primary" data-testid="start" disabled={status === "connecting"} onClick={() => session.start(code || undefined)}>
            {status === "connecting" ? "Connecting…" : "Start"}
          </button>
          <small>Uses your microphone. In live mode your voice is sent to OpenAI to create the answers. This app does not save audio.</small>
        </div>
      )}

      {live && (
        <footer className="bottom">
          {showWords && (
            <div className="words" aria-live="polite">
              {transcript.slice(-6).map((l) => (
                <p key={l.id} className={l.role}><b>{l.role === "child" ? "You" : "Leo"}:</b> {l.text}</p>
              ))}
            </div>
          )}
          {!showWords && lastTeacher && conv.state === "speaking" && lastTeacher.turnId === conv.turnId && (
            <div className="caption" aria-live="polite">{lastTeacher.text}</div>
          )}
          <div className="state" data-testid="state" data-state={conv.state}>{STATE_LABEL[conv.state]}</div>
          <div className="controls">
            <button
              className={`mic ${micEnabled && micAvailable ? "on" : "off"} ${conv.state}`}
              disabled={!micAvailable}
              onClick={() => session.toggleMic()}
              aria-label={micEnabled ? "Mute microphone" : "Unmute microphone"}
            >
              {micAvailable ? (micEnabled ? "🎤" : "🔇") : "🚫"}
            </button>
            {(conv.state === "speaking" || conv.state === "thinking") && (
              <button className="ghost stop" data-testid="interrupt" onClick={() => session.interrupt()}>✋ Stop</button>
            )}
            <button className="ghost" onClick={() => setTyping((v) => !v)} aria-pressed={typing}>⌨️ Type</button>
          </div>
          {typing && (
            <form className="type" onSubmit={submit}>
              <input ref={inputRef} data-testid="text-input" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Type to Leo…" />
              <button className="primary small" type="submit">Send</button>
            </form>
          )}
        </footer>
      )}
    </div>
  );
}
