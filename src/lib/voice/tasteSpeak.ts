/**
 * The landing taste's voice: speaks one tutor reply aloud. Browser only.
 *
 * - Default: the free built-in browser voice (speechSynthesis), the same voice picker the lesson's scripted mode uses
 *   (`voiceFor`). Placeholder quality; voices differ by device.
 * - ElevenLabs first when the server offers the landing pool (`elevenLandingAvailable()`; founder decision 21 Nov:
 *   at most 5,000 characters a day across all landing visitors, plus the per-address bucket, through /api/voice and
 *   all its guards). Pool used up, no key, refusal or any error: the rest of the line, and every later line this
 *   visit, falls back silently to the free browser voice.
 * - The mouth follows a loudness-like envelope while sound is playing (re-synced on each word boundary). It is NOT lip
 *   sync. If the voice never starts, the mouth does not move: no pretend speech.
 * - stop() silences everything; no callback fires after stop().
 */
import type { TeacherId } from "@/lib/teacher/rig";
import { elevenLandingAvailable, speakElevenLine, type ElevenLine } from "./elevenSpeak";
import { loadVoices, ttsAvailable, voiceFor } from "./speech";

let speaking = false;
let t0 = 0;
let seq = 0;

/** 0..1 mouth level right now (0 when silent). */
export function tasteLevel(): number {
  if (!speaking) return 0;
  const t = (performance.now() - t0) / 1000;
  return (0.045 + 0.1 * Math.abs(Math.sin(t * Math.PI * 5))) * Math.max(0.35, 1 - t * 0.9);
}

export interface TasteVoice { stop(): void }
export interface TasteVoiceEvents {
  /** First real sound. */
  onStart(): void;
  /** Finished, failed or never started (spoke = false: no sound was played). */
  onEnd(spoke: boolean): void;
}

/** A voice can be stuck (some Android voices never fire onstart). After this long with no sound, give up quietly. */
export const START_GUARD_MS = 4000;

/**
 * `browserOnly`: never ElevenLabs (fixed lines such as the opener must not spend pool characters).
 * Callbacks are NEVER called before this function returns (a caller's `const v = speakTaste(...)` is safe to read inside
 * onStart/onEnd): the "no speech synthesis at all" path ends in a microtask.
 */
export function speakTaste(text: string, teacher: TeacherId, ev: TasteVoiceEvents, opts: { browserOnly?: boolean } = {}): TasteVoice {
  const my = ++seq;
  const timers: ReturnType<typeof setTimeout>[] = [];
  let eleven: ElevenLine | undefined;
  let began = false;
  let done = false;
  const live = () => my === seq && !done;
  const begin = () => { if (!live() || began) return; began = true; speaking = true; t0 = performance.now(); ev.onStart(); };
  const end = () => { if (!live()) return; done = true; speaking = false; timers.forEach(clearTimeout); ev.onEnd(began); };

  const browser = async (line: string) => {
    if (!ttsAvailable()) { queueMicrotask(end); return; }
    await loadVoices();
    if (!live()) return;
    try {
      const u = new SpeechSynthesisUtterance(line);
      const v = voiceFor(teacher);
      if (v.voice) u.voice = v.voice;
      u.pitch = v.pitch; u.rate = v.rate; u.lang = v.voice?.lang ?? "en-US";
      u.onstart = begin;
      u.onboundary = () => { if (live()) t0 = performance.now(); };
      u.onend = end;
      u.onerror = end;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch { end(); return; }
    timers.push(setTimeout(() => { if (!began) { try { window.speechSynthesis.cancel(); } catch {} end(); } }, START_GUARD_MS));
    timers.push(setTimeout(end, Math.max(4000, line.length * 90) + 9000)); // never hang
  };

  const code = opts.browserOnly ? null : elevenLandingAvailable();
  if (code) {
    let fellBack = false;
    const fallback = (rest: string) => { if (!live() || fellBack) return; fellBack = true; eleven?.stop(); void browser(rest); };
    timers.push(setTimeout(() => { if (!began) fallback(text); }, 6000));
    eleven = speakElevenLine(text, teacher, code, {
      onFirstSound: begin,
      onEnd: end,
      onFail: (spokeAny, rest) => { if (spokeAny && !rest.trim()) end(); else fallback(rest); },
    });
  } else void browser(text);

  return {
    stop() {
      if (my !== seq) return;
      seq++;
      speaking = false;
      timers.forEach(clearTimeout);
      eleven?.stop();
      try { if (ttsAvailable()) window.speechSynthesis.cancel(); } catch {}
    },
  };
}
