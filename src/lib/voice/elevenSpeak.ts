/**
 * One tutor line through ElevenLabs, for the lesson. Split into chunks the route accepts (<= 300 chars, at sentence
 * ends), played one after another. Used only for a tester (passcode present) and only while the server accepts it:
 * the first refusal or error switches ElevenLabs off for the rest of this page visit and the caller falls back to the
 * built-in browser voice. Browser only.
 */
import { getTesterCode } from "@/lib/brain/tester";
import { ELEVEN_MAX_CHARS, type ElevenTeacher } from "@/lib/tts/elevenVoices";
import { speakEleven, type ElevenPlayback } from "./elevenPlayer";

let off = false;
/** True when this visit may use ElevenLabs for the lesson voice. */
export function elevenAvailable(): string | null {
  if (off) return null;
  return getTesterCode();
}
export function disableEleven() { off = true; }
/** For tests. */
export function resetEleven() { off = false; }

/** Split at sentence ends into pieces of at most `max` characters; a single over-long sentence is split at spaces. */
export function chunkText(text: string, max = ELEVEN_MAX_CHARS): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [clean];
  const out: string[] = [];
  let cur = "";
  const push = () => { const t = cur.trim(); if (t) out.push(t); cur = ""; };
  for (const s0 of sentences) {
    let s = s0;
    while (s.length > max) {
      const cut = s.lastIndexOf(" ", max);
      const at = cut > 0 ? cut : max;
      if (cur) push();
      out.push(s.slice(0, at).trim());
      s = s.slice(at);
    }
    if ((cur + s).length > max) push();
    cur += s;
  }
  push();
  return out;
}

export interface ElevenLine { stop(): void }
/**
 * Plays `text` as chunks. `onFirstSound` fires once, at the first queued audio of the first chunk. `onEnd` fires after the
 * last chunk finished. `onFail(spokeAny)` fires on a refusal or error (ElevenLabs is then switched off); if nothing was
 * spoken yet the caller should speak the whole line with the browser voice. Never fires after stop().
 */
export function speakElevenLine(
  text: string, teacher: ElevenTeacher, code: string,
  cb: { onFirstSound: () => void; onEnd: () => void; onFail: (spokeAny: boolean) => void },
): ElevenLine {
  const chunks = chunkText(text);
  let stopped = false;
  let cur: ElevenPlayback | null = null;
  let spoke = false;
  const stop = () => { stopped = true; cur?.stop(); cur = null; };
  void (async () => {
    for (const piece of chunks) {
      if (stopped) return;
      cur = speakEleven(piece, teacher, code, () => { if (!stopped && !spoke) { spoke = true; cb.onFirstSound(); } });
      const res = await cur.done;
      if (stopped || res.result === "stopped") return;
      if (res.result !== "ended") { disableEleven(); cb.onFail(spoke); return; }
    }
    if (!stopped) cb.onEnd();
  })();
  return { stop };
}
