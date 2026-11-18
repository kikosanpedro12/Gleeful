/**
 * One tutor line through ElevenLabs, for the lesson. Split into chunks the route accepts (<= 300 chars, at sentence
 * ends), played one after another. Used only for a tester (passcode present) and only while the server accepts it:
 * the first refusal or error switches ElevenLabs off for the rest of this page visit and the caller falls back to the
 * built-in browser voice. Browser only.
 */
import { getTesterCode } from "@/lib/brain/tester";
import { ELEVEN_ENDPOINT, ELEVEN_MAX_CHARS, PUBLIC_VOICE, type ElevenTeacher } from "@/lib/tts/elevenVoices";
import { speakEleven, type ElevenPlayback } from "./elevenPlayer";

let off = false;
let publicVoice = false;
let probed = false;
/** Asks the server once whether the public taste is switched on. Until it answers, the browser voice is used. */
export function probeVoice(f: typeof fetch = (...a) => fetch(...a)): Promise<void> {
  if (probed) return Promise.resolve();
  probed = true;
  return f(ELEVEN_ENDPOINT, { method: "GET", cache: "no-store", credentials: "same-origin" })
    .then(async (r) => { if (r.ok) { const j = (await r.json()) as { configured?: unknown; public?: unknown }; publicVoice = j.configured === true && j.public === true; } })
    .catch(() => { /* cannot tell: browser voice */ });
}
/** True when this visit may use ElevenLabs for the lesson voice: a passcode, or the public taste when the server offers it. */
export function elevenAvailable(): string | null {
  if (off) return null;
  const code = getTesterCode();
  if (code) return code;
  if (!probed) void probeVoice();
  return publicVoice ? PUBLIC_VOICE : null;
}
export function disableEleven() { off = true; }
/** For tests. */
export function resetEleven() { off = false; publicVoice = false; probed = false; }

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
/** Deadline for one chunk: fetch + playback. A suspended audio context or stalled stream must not hang the lesson. */
export const chunkDeadlineMs = (piece: string) => 12_000 + piece.length * 90;
/**
 * Plays `text` as chunks. `onFirstSound` fires once, at the first queued audio of the first chunk. `onEnd` fires after the
 * last chunk finished (or a later chunk stalled past its deadline). `onFail(spokeAny, rest)` fires on a refusal or error:
 * `rest` is the text not yet spoken (the whole line if nothing was). A 403, 503 or network error switches ElevenLabs off
 * for this visit; a 429 (rate limit) does not. Never fires after stop().
 */
export function speakElevenLine(
  text: string, teacher: ElevenTeacher, code: string,
  cb: { onFirstSound: () => void; onEnd: () => void; onFail: (spokeAny: boolean, rest: string) => void },
): ElevenLine {
  const chunks = chunkText(text);
  let stopped = false;
  let cur: ElevenPlayback | null = null;
  let spoke = false;
  const stop = () => { stopped = true; cur?.stop(); cur = null; };
  void (async () => {
    for (let i = 0; i < chunks.length; i++) {
      const piece = chunks[i];
      if (stopped) return;
      const pb = (cur = speakEleven(piece, teacher, code, () => { if (!stopped && !spoke) { spoke = true; cb.onFirstSound(); } }));
      let timer: ReturnType<typeof setTimeout> | undefined;
      const res = await Promise.race([
        pb.done,
        new Promise<"late">((r) => { timer = setTimeout(() => r("late"), chunkDeadlineMs(piece)); }),
      ]);
      clearTimeout(timer);
      if (stopped) return;
      if (res === "late") { pb.stop(); disableEleven(); if (spoke) cb.onEnd(); else cb.onFail(false, chunks.join(" ")); return; }
      if (res.result === "stopped") return;
      if (res.result !== "ended") {
        if (!(res.result === "refused" && res.status === 429 && code !== PUBLIC_VOICE)) disableEleven(); // a public taste that ran out stays off for this visit, so later lines do not wait on a refusal
        cb.onFail(spoke, chunks.slice(i).join(" "));
        return;
      }
    }
    if (!stopped) cb.onEnd();
  })();
  return { stop };
}
