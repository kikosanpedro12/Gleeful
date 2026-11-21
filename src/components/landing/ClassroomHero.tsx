"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import StoryPanel from "@/components/StoryPanel";
import { useSession } from "@/lib/session/store";
import { session } from "@/lib/session/controller";
import { parseFrame } from "@/lib/scene/frame";
import { elevenLandingAvailable, probeVoice } from "@/lib/voice/elevenSpeak";
import { primeAudio } from "@/lib/voice/elevenPlayer";
import { listenOnce, recognitionAvailable, type Listening } from "@/lib/voice/speech";
import { speakTaste, tasteLevel, type TasteVoice } from "@/lib/voice/tasteSpeak";
import { TASTE_ENDPOINT, TASTE_MAX_INPUT, TASTE_MAX_TURNS, type TasteRequest } from "@/lib/taste/protocol";
import { choicesOk, topicOk } from "@/lib/taste/boardText";
import { askTaste } from "@/lib/taste/client";
import { openerLine, paywallCopy, STARTERS, tapChips } from "./tasteCopy";

const Stage = dynamic(() => import("@/components/Stage"), { ssr: false });

type Teacher = "leo" | "mia";
type Line = { role: "visitor" | "teacher"; text: string };
type Phase = "checking" | "live" | "unavailable";
/** none: this browser has no speech recognition (Firefox), so no mic button. denied: the visitor blocked the mic. */
type Mic = "unknown" | "ok" | "none" | "denied";
const IDEAS: readonly string[] = STARTERS.map((s) => s.ask);
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
  const voice = useRef<TasteVoice | null>(null);
  const listen = useRef<Listening | null>(null);
  const [mic, setMic] = useState<Mic>("unknown");
  const [listening, setListening] = useState(false);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  /** The tutor's 2 tap answers from the last reply (validated again here), and what the visitor explored. */
  const [choices, setChoices] = useState<string[]>([]);
  const [topic, setTopic] = useState<string | null>(null);
  const lastTurn = useRef(false);
  /** The page is mounted. Checked after every await so nothing speaks, acts or sets a timer for a visitor who has left. */
  const alive = useRef(true);
  /** Set synchronously, so a mic result and a chip tap in the same tick cannot send two questions. */
  const busyRef = useRef(false);
  const postCtl = useRef<AbortController | null>(null);
  const flash = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The paywall never waits longer than this for the tutor's last line to finish. */
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busyNote, setBusyNote] = useState(false);

  useEffect(() => {
    alive.current = true;
    setWebgl(hasWebgl());
    setMic(recognitionAvailable() ? "ok" : "none");
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
    // Leaving the page (close, back/forward cache, a link away): stop speech and drop the pending question.
    const leave = () => { postCtl.current?.abort(); voice.current?.stop(); };
    window.addEventListener("pagehide", leave);
    return () => {
      alive.current = false;
      window.removeEventListener("pagehide", leave);
      if (timer.current) clearTimeout(timer.current);
      if (maxTimer.current) clearTimeout(maxTimer.current);
      ctl.abort(); postCtl.current?.abort();
      voice.current?.stop(); voice.current = null; listen.current?.();
      session.closeScene(); session.tasteClose();
    };
  }, []);

  /** Only the chosen tutor stays on stage. Status is set on the store directly: no lesson provider runs on the landing. */
  function pick(t: Teacher) {
    setTeacher(t);
    setTimeout(() => document.getElementById("class-q")?.focus({ preventScroll: true }), 50);
    session.setTasteLevel(tasteLevel); session.tasteOpen(t);
    // The tutor leads from the first second: a fixed line offering the two starter questions (tap choices below), a wave,
    // the free browser voice only (a fixed line never spends ElevenLabs characters). No model call, not a try.
    session.tasteActs({ gesture: "wave" });
    say(openerLine(t === "mia" ? "Mia" : "Leo"), t, true);
  }

  /** Swap to the grown-up card. Audio is silenced first, so Stop / Voice never disappear while sound still plays. */
  function showPaywall() {
    if (!alive.current) return;
    if (timer.current) clearTimeout(timer.current);
    if (maxTimer.current) clearTimeout(maxTimer.current);
    timer.current = maxTimer.current = null;
    if (voice.current) { voice.current.stop(); voice.current = null; session.tasteSpeaking(false); }
    setSpeaking(false);
    setOver(true);
  }
  /** After the last answer: a short beat once the tutor has finished (or been stopped), so the tease is heard first. */
  function paywallSoon(ms: number) {
    if (!lastTurn.current || !alive.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(showPaywall, ms);
  }

  /** Silence the tutor (Stop button, mute, a new question, the mic). */
  function hush(interrupt: boolean) {
    const was = voice.current;
    voice.current = null;
    was?.stop();
    setSpeaking(false);
    if (interrupt) session.tasteStop();
    if (was) paywallSoon(1500); // Stop pressed on the last answer: the visitor has heard enough
  }

  function say(reply: string, t: Teacher, browserOnly = false) {
    if (!alive.current) return;
    if (mutedRef.current) { session.tasteSpeaking(false); return; }
    const v: TasteVoice = speakTaste(reply, t, {
      onStart: () => { if (voice.current !== v) return; setSpeaking(true); session.tasteSpeaking(true); },
      onEnd: () => {
        if (voice.current !== v) return;
        voice.current = null; setSpeaking(false); session.tasteSpeaking(false);
        paywallSoon(1500); // the tease has been heard
      },
    }, { browserOnly });
    voice.current = v;
  }

  function toggleMute() {
    const m = !mutedRef.current;
    mutedRef.current = m;
    setMuted(m);
    if (m && voice.current) hush(true);
  }

  /** Tap to talk: the browser's own speech-to-text (the same one the lesson uses). Tap again to finish. */
  function talk() {
    if (busyRef.current || busy || !teacher || used >= TASTE_MAX_TURNS || mic !== "ok") return;
    if (listening) { listen.current?.stop(); return; }
    if (voice.current) hush(true);
    setMicNote(null); setTrouble(false);
    setListening(true);
    session.tasteListening(true);
    listen.current = listenOnce({
      onStart: () => {},
      onInterim: (t) => setText(t.slice(0, TASTE_MAX_INPUT)),
      onFinal: (t) => {
        listen.current = null; setListening(false); session.tasteListening(false);
        const q = t.slice(0, TASTE_MAX_INPUT).trim();
        if (busyRef.current) return; // a chip was tapped in the same moment: that question is already on its way
        if (q) { setText(q); void send(q); } else setMicNote(`${name} didn't hear anything. Tap the mic and try again, or type.`);
      },
      onNothing: (reason) => {
        listen.current = null; setListening(false); session.tasteListening(false);
        if (reason === "denied") { setMic("denied"); setMicNote("The mic is blocked in this browser. You can type your question instead."); }
        else if (reason === "no-speech") setMicNote(`${name} didn't hear anything. Tap the mic and try again, or type.`);
        else if (reason === "error") setMicNote("The mic didn't work here. You can type your question instead.");
      },
    });
  }

  async function send(raw: string) {
    const q = raw.trim();
    if (!q || busyRef.current || busy || !teacher || used >= TASTE_MAX_TURNS || !alive.current) return;
    busyRef.current = true;
    setBusy(true); setTrouble(false); setBusyNote(false); setMicNote(null); hush(false);
    if (listen.current) { listen.current(); listen.current = null; setListening(false); session.tasteListening(false); }
    if (elevenLandingAvailable()) primeAudio();
    session.tasteAsked(); // a new turn: the tutor nods and thinks; anything left from the last answer is dropped
    const body: TasteRequest = { v: 1, tasteId: id.current, text: q, teacher, history: lines.slice(-4) };
    const ctl = (postCtl.current = new AbortController());
    try {
      const r = await askTaste(body, { signal: ctl.signal, alive: () => alive.current });
      if (!alive.current || r.kind === "aborted") return; // the visitor left: no speech, acts, board or timer
      if (r.kind === "reply") {
        const { reply, left } = r.reply;
        setLines((l) => [...l, { role: "visitor", text: q }, { role: "teacher", text: reply }]);
        setUsed(TASTE_MAX_TURNS - left);
        setText(""); setBusyNote(false);
        setChoices(left > 0 && choicesOk(r.reply.choices) ? r.reply.choices : []); // the last try ends with a tease: no tap answers (ignored here even if sent)
        if (topicOk(r.reply.topic)) setTopic(r.reply.topic);
        const f = r.reply.scene ? parseFrame(r.reply.scene) : null; // the browser re-checks: our own ids only
        if (f?.ok) useSession.setState({ scene: { id: Date.now(), frame: f.frame } }); else session.closeScene();
        session.tasteActs({ gesture: r.reply.gesture, act: r.reply.act, board: r.reply.board }); // validated again here: own ids, this world's actions only
        lastTurn.current = left <= 0;
        say(reply, teacher);
        if (left <= 0) {
          maxTimer.current = setTimeout(showPaywall, 25_000); // at most this long, however slow the voice
          if (!voice.current) paywallSoon(5000); // voice off: time to read the tease
        }
      } else {
        session.tasteSpeaking(false);
        if (r.kind === "over") { setUsed(TASTE_MAX_TURNS); setOver(true); }
        else if (r.kind === "busy") setBusyNote(true);
        else setTrouble(true); // rate_limited or trouble
      }
    } finally {
      busyRef.current = false;
      if (postCtl.current === ctl) postCtl.current = null;
      if (alive.current) { setBusy(false); setTimeout(() => { if (alive.current) document.getElementById("class-q")?.focus({ preventScroll: true }); }, 60); }
    }
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
            <p className="lp-tag lp-tag-live"><span aria-hidden className="lp-dot" /> Live AI tutor · {TASTE_MAX_TURNS} free tries</p>
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
                : <p className="lp-wait" data-testid="taste-opener">{openerLine(name ?? "your tutor")}</p>}
            </div>
            {/* One wrapping row: voice controls, then starter ideas (before the first question only) or the tutor's own 2 answers. Keeps the card short on phones. */}
            {(() => {
              const c = tapChips({ used, asked: lines.length, choices, ideas: IDEAS, last: used >= TASTE_MAX_TURNS });
              const voiceRow = speaking || lines.length > 0;
              if (!c.items.length && !voiceRow) return null;
              return (
                <div className="lp-taste-actions">
                  {speaking && <button type="button" className="lp-btn lp-btn-soft" onClick={() => hush(true)} data-testid="taste-stop">Stop talking</button>}
                  {voiceRow && <button type="button" className="lp-btn lp-btn-soft" aria-pressed={muted} onClick={toggleMute} data-testid="taste-mute">{muted ? "Voice off" : "Voice on"}</button>}
                  {c.items.length > 0 && (
                    <div className="lp-chips" role="group" aria-label={c.kind === "ideas" ? "Question ideas" : `Answer ${name}`} data-testid={c.kind === "ideas" ? "taste-chips" : "taste-choices"}>
                      {c.items.map((i) => <button key={i} type="button" className="lp-chip" disabled={busy || listening} onClick={() => void send(i)}>{i}</button>)}
                    </div>
                  )}
                </div>
              );
            })()}
            <form className="lp-taste-row" aria-busy={busy} onSubmit={(e) => { e.preventDefault(); void send(text); }}>
              <label className="lp-sr" htmlFor="class-q">Your question</label>
              <input id="class-q" className="lp-taste-input" type="text" autoComplete="off" enterKeyHint="send" maxLength={TASTE_MAX_INPUT}
                value={text} onChange={(e) => setText(e.target.value)} placeholder={listening ? "Listening…" : `Ask ${name}…`} disabled={busy || listening} />
              {mic === "ok" && (
                <button type="button" className={listening ? "lp-btn lp-btn-main lp-mic lp-mic-on" : "lp-btn lp-btn-main lp-mic"} onClick={talk} disabled={busy}
                  aria-label={listening ? "Stop listening and send" : `Talk to ${name}`} data-testid="taste-mic">
                  <svg viewBox="0 0 24 24" aria-hidden width="22" height="22"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" fill="currentColor" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </button>
              )}
              <button className="lp-btn lp-btn-main" type="submit" disabled={busy || listening || !text.trim()}>Ask</button>
            </form>
            <p className="lp-sr" role="status">{listening ? `Listening. Say your question, then tap the mic again.` : ""}</p>
            {micNote && <p className="lp-taste-err" role="status" data-testid="taste-mic-note">{micNote}</p>}
            <div className="lp-taste-meta">
              <p className="lp-count" data-testid="taste-count">
                <span className="lp-pips" aria-hidden>{Array.from({ length: TASTE_MAX_TURNS }, (_, i) => <span key={i} className={i < used ? "lp-pip lp-pip-on" : "lp-pip"} />)}</span>
                <span>{used === 0 ? `${TASTE_MAX_TURNS} free tries` : `${used} of ${TASTE_MAX_TURNS} used`}</span>
              </p>
              <p className="lp-fine-print">It&apos;s an AI and can be wrong. Please don&apos;t type or say private details.</p>
              {mic === "ok" && <p className="lp-fine-print" data-testid="taste-mic-disclosure">Mic: your browser sends your voice to its maker (Google, Microsoft or Apple) to turn it into text. We only get the text.</p>}
            </div>
            {busyNote && <p className="lp-taste-err" role="status">The tutor is busy right now. Please try again a little later.</p>}
            {trouble && <p className="lp-taste-err" role="status">{name} didn&apos;t hear that. Wait a moment and try again.</p>}
          </div>
        )}

        {over && (() => {
          const p = paywallCopy(name, topic);
          return (
            <div className="lp-card lp-paywall" data-testid="paywall" role="region" aria-label="For grown-ups: keep learning" tabIndex={-1} ref={(el) => { el?.focus({ preventScroll: true }); }}>
              <p className="lp-tag">For grown-ups</p>
              <h2 className="lp-paywall-h" data-testid="paywall-h">{p.heading}</h2>
              <p>{p.body}</p>
              <a className="lp-btn lp-btn-main" href="/sign-in" data-testid="start-trial">Start 7-day free trial</a>
              <p className="lp-fine-print">Nothing is charged today. Payments are not switched on yet.</p>
              <a className="lp-link" href="/pricing">See pricing</a>
            </div>
          );
        })()}
      </div>
      <div className="lp-board" aria-live="polite"><StoryPanel /></div>
    </section>
  );
}
