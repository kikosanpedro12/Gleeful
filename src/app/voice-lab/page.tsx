"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ENGINES, LINES, shuffled, summary, tally, type EngineId, type Rating, type Teacher } from "@/lib/voicelab/lines";
import { loadVoices, ttsAvailable, voiceFor } from "@/lib/voice/speech";

/**
 * Blind voice A/B for a real phone. Each of five lesson lines is offered in three unlabeled slots (the engine
 * order is shuffled per line); the listener rates each slot, then reveals which engine was which.
 * Nothing is recorded or sent anywhere: ratings stay on this screen, and "Copy results" is a text summary.
 * Side page only: it does not touch the lesson.
 */
const SLOT = ["A", "B", "C"];
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

  // Different unlabeled order for every line, fixed until "Shuffle again".
  const orders = useMemo(() => {
    let s = (seed + 1) * 2654435761 >>> 0;
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    return LINES.map(() => shuffled(ENGINES.map((e) => e.id), rand));
  }, [seed]);

  useEffect(() => { void loadVoices(); setSeed(Math.floor(Math.random() * 1e6)); }, []);
  useEffect(() => () => stop(), []);

  function stop() {
    try { audio.current?.pause(); } catch {}
    try { if (ttsAvailable()) window.speechSynthesis.cancel(); } catch {}
    setPlaying(null);
  }

  async function play(line: number, engine: EngineId) {
    stop();
    const key = `${line}-${engine}`;
    setPlaying(key);
    const def = ENGINES.find((e) => e.id === engine)!;
    const url = def.clip(teacher, line);
    if (url) {
      const a = (audio.current ??= new Audio());
      a.src = url;
      a.onended = () => setPlaying((p) => (p === key ? null : p));
      a.onerror = () => { setPlaying(null); setNote("That clip could not be played."); };
      try { await a.play(); } catch { setPlaying(null); setNote("Tap play again (the browser blocked autoplay)."); }
      return;
    }
    if (!ttsAvailable()) { setPlaying(null); setNote("This browser has no built-in voice."); return; }
    await loadVoices();
    const v = voiceFor(teacher);
    const u = new SpeechSynthesisUtterance(LINES[line]);
    if (v.voice) u.voice = v.voice;
    u.pitch = v.pitch; u.rate = v.rate; u.lang = v.voice?.lang ?? "en-US";
    u.onend = () => setPlaying((p) => (p === key ? null : p));
    u.onerror = () => setPlaying(null);
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
      <p>Listen to each line in A, B and C, then rate each one. You will not know which is which until the end.</p>
      <div className="vlab-who" role="group" aria-label="Teacher">
        {(["leo", "mia"] as const).map((id) => (
          <button key={id} aria-pressed={teacher === id} className={teacher === id ? "on" : ""} onClick={() => { stop(); setTeacher(id); setRatings(LINES.map(() => ({}))); setRevealed(false); setCopied(false); setNote(""); }}>
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
                      <button key={r.id} aria-pressed={ratings[i][engine] === r.id} className={ratings[i][engine] === r.id ? `on ${r.id}` : ""} onClick={() => rate(i, engine, r.id)}>{r.label}</button>
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
        <button className="ghost" onClick={() => { stop(); setSeed((s) => s + 1); setRatings(LINES.map(() => ({}))); setRevealed(false); setCopied(false); }}>Shuffle and start over</button>
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
          <small>Nothing was saved or sent. Send me the numbers (or paste the copied text).</small>
        </section>
      )}
      <small className="vlab-fine">The Kokoro clips are samples made ahead of time with an open-source model. A paid voice is not in this test yet.</small>
    </main>
  );
}
