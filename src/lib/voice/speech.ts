/**
 * Browser speech, free and built in. PLACEHOLDER quality: voices differ by
 * device and are not our final teacher voices.
 *  - Output: speechSynthesis (on-device or OS voices).
 *  - Input: SpeechRecognition (Chrome sends the audio to Google's servers to
 *    transcribe it; this is disclosed in the UI). Not available in Firefox.
 */
import type { TeacherId } from "@/lib/teacher/rig";

const MALE = /(male|david|mark|guy|daniel|george|james|fred|alex|aaron|arthur|ryan|thomas|rishi|en-us-x-iom|en-gb-x-rjs|en-us-x-tpd)/i;
const FEMALE = /(female|zira|samantha|susan|hazel|karen|moira|tessa|serena|victoria|aria|jenny|libby|sonia|en-us-x-sfg|en-us-x-tpf|en-gb-x-gba)/i;

let cache: SpeechSynthesisVoice[] = [];
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !window.speechSynthesis) return Promise.resolve([]);
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve((cache = now));
  return new Promise((res) => {
    const done = () => res((cache = window.speechSynthesis.getVoices()));
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1200);
  });
}

export interface VoiceChoice { voice: SpeechSynthesisVoice | null; pitch: number; rate: number }

/** Best-effort male/female English voice. Falls back to pitch shaping if the device has one voice. */
export function voiceFor(teacher: TeacherId): VoiceChoice {
  const en = cache.filter((v) => /^en(-|_|$)/i.test(v.lang));
  const want = teacher === "leo" ? MALE : FEMALE;
  const avoid = teacher === "leo" ? FEMALE : MALE;
  const pick =
    en.find((v) => want.test(v.name) && /natural|neural|online|google/i.test(v.name)) ??
    en.find((v) => want.test(v.name) || want.test(v.voiceURI)) ??
    en.find((v) => !avoid.test(v.name) && v.localService) ??
    en[0] ?? null;
  const matched = !!pick && (want.test(pick.name) || want.test(pick.voiceURI));
  return { voice: pick, pitch: matched ? 1 : teacher === "leo" ? 0.82 : 1.2, rate: 0.98 };
}

export const ttsAvailable = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

// ------------------------------------------------------------ recognition
type SR = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null;
  onspeechstart: (() => void) | null; onspeechend: (() => void) | null; onstart: (() => void) | null;
};
const SRClass = (): (new () => SR) | null =>
  typeof window === "undefined" ? null : ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null);
export const recognitionAvailable = () => !!SRClass();

export interface ListenHandlers {
  onStart(): void;
  onInterim(text: string): void;
  /** speechEndAt: when the browser detected the child stopped (if it told us). */
  onFinal(text: string, speechEndAt: number | undefined): void;
  onNothing(reason: "no-speech" | "denied" | "error" | "aborted"): void;
}

/** One utterance, tap-to-talk. Returns a cancel function (throws the audio away); `.stop()` on it finishes the
 *  utterance instead, so what the child already said is still delivered. */
export type Listening = (() => void) & { stop: () => void };
export function listenOnce(h: ListenHandlers): Listening {
  const C = SRClass();
  const mk = (cancel: () => void, stop: () => void): Listening => Object.assign(cancel, { stop });
  if (!C) { h.onNothing("error"); return mk(() => {}, () => {}); }
  const r = new C();
  r.lang = "en-US";
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  let speechEndAt: number | undefined;
  let finished = false;
  let lastInterim = "";
  const finish = (fn: () => void) => { if (!finished) { finished = true; fn(); } };
  r.onstart = () => h.onStart();
  r.onspeechend = () => { speechEndAt = performance.now(); };
  r.onresult = (e: any) => {
    let interim = "", final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0]?.transcript ?? "";
      if (e.results[i].isFinal) final += t; else interim += t;
    }
    if (final.trim()) finish(() => h.onFinal(final.trim(), speechEndAt));
    else if (interim.trim()) { lastInterim = interim.trim(); h.onInterim(lastInterim); }
  };
  r.onerror = (e: any) => {
    const code = String(e?.error ?? "");
    finish(() => h.onNothing(code === "not-allowed" || code === "service-not-allowed" ? "denied" : code === "no-speech" ? "no-speech" : code === "aborted" ? "aborted" : "error"));
  };
  // Android Chrome often ends with only interim text when the child taps stop: keep what was heard.
  r.onend = () => finish(() => (lastInterim ? h.onFinal(lastInterim, speechEndAt) : h.onNothing("no-speech")));
  try { r.start(); } catch { finish(() => h.onNothing("error")); }
  return mk(
    () => { finished = true; try { r.abort(); } catch {} },
    () => { try { r.stop(); } catch { finish(() => h.onNothing("error")); } },
  );
}
