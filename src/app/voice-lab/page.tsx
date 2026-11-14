"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ENGINES, LINES, shuffled, summary, tally, type EngineId, type Rating, type Teacher } from "@/lib/voicelab/lines";
import { loadVoices, ttsAvailable, voiceFor } from "@/lib/voice/speech";
import { TESTER_HEADER, getTesterCode } from "@/lib/brain/tester";
import { TTS_ENDPOINT } from "@/lib/tts/voices";

/**
 * Blind voice A/B for a real phone. Each of five lesson lines is offered in six unlabeled slots (the engine
 * order is shuffled per line); the listener rates each slot, then reveals which engine was which.
 * Ratings stay on this screen (not saved or sent); "Copy results" is a text summary. The five sample lines ARE sent to
 * Deepgram, through /api/tts, to make its voices.
 * Side page only: it does not touch the lesson.
 */
const SLOT = ["A", "B", "C", "D", "E", "F"];
const RATINGS: { id: Rating; label: string }[] = [{ id: "great", label: "Great" }, { id: "ok", label: "OK" }, { id: "robotic", label: "Robotic" }];

export default function VoiceLab() {
  const [teacher, setTeacher] = useState<Teacher>("leo");
  const [seed, setSeed] = useState(0);
  const [ratings, setRatings] = useState<Partial<Record<EngineId, Rating>>[]>(() => LINES.map(() => ({})));
  const [playing, setPlaying] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  // Bumped on every stop and every new play: a slow fetch from an earlier tap must never start sound or touch the UI.
  const playId = useRef(0);
  const [heard, setHeard] = useState<Set<string>>(() => new Set());
  // Deepgram clips fetched this visit (blob URLs), so replaying a line costs nothing.
  const dgCache = useRef(new Map<string, string>());

  // Different unlabeled order for every line, fixed until "Shuffle again".
  const orders = useMemo(() => {
    let s = (seed + 1) * 2654435761 >>> 0;
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    return LINES.map(() => shuffled(ENGINES.map((e) => e.id), rand));
  }, [seed]);

  useEffect(() => { void loadVoices(); setSeed(Math.floor(Math.random() * 1e6)); }, []);
  useEffect(() => () => { stop(); for (const u of dgCache.current.values()) URL.revokeObjectURL(u); dgCache.current.clear(); }, []);

  function stop() {
    playId.current++;
    try { audio.current?.pause(); } catch {}
    try { if (ttsAvailable()) window.speechSynthesis.cancel(); } catch {}
    setPlaying(null);
  }

  async function play(line: number, engine: EngineId) {
    stop();
    const id = playId.current;
    const live = () => playId.current === id;
    const key = `${line}-${engine}`;
    const fail = (msg: string) => { if (live()) { setPlaying(null); setNote(msg); } };
    const started = () => { if (live()) setHeard((h) => new Set(h).add(`${teacher}-${key}`)); };
    setPlaying(key);
    setNote("");
    const def = ENGINES.find((e) => e.id === engine)!;
    let url = def.clip(teacher, line);
    if (def.voice) {
      const voice = def.voice(teacher);
      const ck = `${voice}|${line}`;
      url = dgCache.current.get(ck) ?? null;
      if (!url) {
        const code = getTesterCode();
        if (!code) return fail("Open /tester and enter the passcode first, then come back to this page in the same tab.");
        try {
          const r = await fetch(TTS_ENDPOINT, { method: "POST", headers: { "content-type": "application/json", [TESTER_HEADER]: code }, body: JSON.stringify({ text: LINES[line], voice }) });
          if (!live()) return;
          if (!r.ok) return fail(r.status === 403 ? "Wrong passcode for this voice." : r.status === 429 ? "Voice limit reached for now." : "This voice is not available right now.");
          const blob = await r.blob();
          if (!live()) return;
          url = URL.createObjectURL(blob);
          dgCache.current.set(ck, url);
        } catch { return fail("Could not reach the voice service."); }
      }
    }
    if (url) {
      const a = (audio.current ??= new Audio());
      a.src = url;
      a.onended = () => { if (live()) setPlaying((p) => (p === key ? null : p)); };
      a.onerror = () => fail("That clip could not be played.");
      try { await a.play(); } catch { return fail("Tap play again (the browser blocked autoplay)."); }
      started();
      return;
    }
    if (!ttsAvailable()) return fail("This browser has no built-in voice.");
    await loadVoices();
    if (!live()) return;
    const v = voiceFor(teacher);
    const u = new SpeechSynthesisUtterance(LINES[line]);
    if (v.voice) u.voice = v.voice;
    u.pitch = v.pitch; u.rate = v.rate; u.lang = v.voice?.lang ?? "en-US";
    u.onstart = started;
    u.onend = () => { if (live()) setPlaying((p) => (p === key ? null : p)); };
    u.onerror = () => { if (live()) setPlaying(null); };
    window.speechSynthesis.speak(u);
  }

  const rate = (line: number, engine: EngineId, r: Rating) =>
    setRatings((all) => all.map((m, i) => (i === line ? { ...m, [engine]: r } : m)));
  const done = ratings.every((m) => ENGINES.every((e) => m[e.id]));
  const t = tally(ratings);
  const text = summary(teacher, t);

  return (
    <main className="vlab">
      <h1>Which voice sounds best?</h1>
      <p>Listen to each line in A to F, then rate each one (you can rate a voice once you have heard it). You will not know which is which until the end.</p>
      <div className="vlab-who" role="group" aria-label="Teacher">
        {(["leo", "mia"] as const).map((id) => (
          <button key={id} aria-pressed={teacher === id} className={teacher === id ? "on" : ""} onClick={() => { stop(); setTeacher(id); setHeard(new Set()); setRatings(LINES.map(() => ({}))); setRevealed(false); setCopied(false); setNote(""); }}>
            {id === "leo" ? "Leo (male voice)" : "Mia (female voice)"}
          </button>
        ))}
      </div>
      {note && <p className="vlab-note" role="status">{note}</p>}

      {LINES.map((line, i) => (
        <section key={i} className="vlab-line" aria-label={`Line ${i + 1}`}>
          <h2>{i + 1}. “{line}”</h2>
          <div className="vlab-slots">
            {orders[i].map((engine, slot) => {
              const key = `${i}-${engine}`;
              const on = playing === key;
              return (
                <div key={engine} className="vlab-slot">
                  <button className={`vlab-play ${on ? "on" : ""}`} onClick={() => (on ? stop() : void play(i, engine))} aria-label={`${on ? "Stop" : "Play"} voice ${SLOT[slot]}, line ${i + 1}`}>
                    <b>{SLOT[slot]}</b><span>{on ? "Stop" : "Play"}</span>
                  </button>
                  <div className="vlab-rate" role="group" aria-label={`Rate voice ${SLOT[slot]}, line ${i + 1}`}>
                    {RATINGS.map((r) => (
                      <button key={r.id} disabled={!heard.has(`${teacher}-${key}`)} aria-pressed={ratings[i][engine] === r.id} className={ratings[i][engine] === r.id ? `on ${r.id}` : ""} onClick={() => rate(i, engine, r.id)}>{r.label}</button>
                    ))}
                  </div>
                  {revealed && <small className="vlab-reveal">{ENGINES.find((e) => e.id === engine)!.name}</small>}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="vlab-actions">
        <button className="primary" disabled={!done} onClick={() => { stop(); setRevealed(true); }}>{done ? "Show which voice was which" : "Rate every voice to finish"}</button>
        <button className="ghost" onClick={() => { stop(); setSeed((s) => s + 1); setHeard(new Set()); setRatings(LINES.map(() => ({}))); setRevealed(false); setCopied(false); }}>Shuffle and start over</button>
      </div>

      {revealed && (
        <section className="vlab-result" data-testid="vlab-result" aria-live="polite">
          <h2>Results</h2>
          <ul>
            {ENGINES.map((e) => (
              <li key={e.id}><b>{e.name}</b><br />Great {t[e.id].great} · OK {t[e.id].ok} · Robotic {t[e.id].robotic}</li>
            ))}
          </ul>
          <button className="ghost" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setNote("Could not copy. Select the numbers above instead."); } }}>{copied ? "Copied" : "Copy results"}</button>
          <small>Your ratings were not saved or sent. The sample lines were sent to Deepgram to make its voices. Send me the numbers (or paste the copied text).</small>
        </section>
      )}
      <small className="vlab-fine">The Kokoro clip is a sample made ahead of time with an open-source model. The Deepgram voices are spoken live by the paid API and need the tester passcode (open /tester first, same tab).</small>
    </main>
  );
}
