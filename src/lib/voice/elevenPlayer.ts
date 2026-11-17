/**
 * Plays ElevenLabs speech as it arrives. /api/voice streams raw 16-bit mono PCM; each chunk is converted and queued
 * on a Web Audio clock, so sound can start before the whole line has downloaded. Browser only.
 *
 * What the timing means: `firstSoundMs` is an ESTIMATE of when audio was queued: it runs from the moment this function was called until the first queued sample
 * is due to play. It includes our server and ElevenLabs. It does NOT include the phone's own speaker/Bluetooth delay,
 * and it is not the "child stops talking" timer (that one starts at the end of the child's speech).
 */
import { TESTER_HEADER } from "@/lib/brain/tester";
import { ELEVEN_ENDPOINT, ELEVEN_RATE_HEADER, ELEVEN_SAMPLE_RATE, type ElevenTeacher } from "@/lib/tts/elevenVoices";

/** 16-bit little-endian PCM bytes to floats in -1..1. An odd trailing byte is returned so it can lead the next chunk. */
export function pcm16ToFloat32(bytes: Uint8Array, carry: number | null = null): { samples: Float32Array; rest: number | null } {
  let src = bytes;
  if (carry !== null) { const m = new Uint8Array(bytes.length + 1); m[0] = carry; m.set(bytes, 1); src = m; }
  const n = src.length >> 1;
  const view = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
  return { samples, rest: src.length & 1 ? src[src.length - 1] : null };
}

export type ElevenResult = "ended" | "stopped" | "refused" | "error";
export interface ElevenTiming { firstSoundMs: number | null; totalMs: number | null }
export interface ElevenPlayback {
  stop(): void;
  /** Resolves when the line has finished, was stopped, or could not be played. Never rejects. */
  done: Promise<{ result: ElevenResult; status?: number; timing: ElevenTiming }>;
}

let ctx: AudioContext | null = null;
/** Call from a tap so the browser lets sound start (autoplay rules). */
export function primeAudio(): AudioContext | null {
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx ??= new C();
    void ctx.resume();
    return ctx;
  } catch { return null; }
}

const LEAD_S = 0.06; // small cushion so a slow chunk does not cause a gap at the very start

export function speakEleven(text: string, teacher: ElevenTeacher, code: string, onFirstSound?: (ms: number) => void): ElevenPlayback {
  const t0 = performance.now();
  const ac = primeAudio();
  const ctl = new AbortController();
  const sources: AudioBufferSourceNode[] = [];
  let stopped = false;
  let release: (() => void) | null = null; // settles the final-playback wait when stop() runs
  const timing: ElevenTiming = { firstSoundMs: null, totalMs: null };

  const stop = () => {
    stopped = true;
    try { ctl.abort(); } catch { /* already done */ }
    for (const s of sources) { try { s.onended = null; s.stop(); } catch { /* not started */ } }
    sources.length = 0;
    release?.();
  };

  const done = (async (): Promise<{ result: ElevenResult; status?: number; timing: ElevenTiming }> => {
    if (!ac) return { result: "error", timing };
    try {
      const r = await fetch(ELEVEN_ENDPOINT, { method: "POST", headers: { "content-type": "application/json", [TESTER_HEADER]: code }, body: JSON.stringify({ text, teacher }), signal: ctl.signal });
      if (!r.ok || !r.body) return { result: r.status === 403 || r.status === 429 || r.status === 503 ? "refused" : "error", status: r.status, timing };
      const rate = Number(r.headers.get(ELEVEN_RATE_HEADER)) || ELEVEN_SAMPLE_RATE;
      const reader = r.body.getReader();
      let carry: number | null = null;
      let next = 0;
      let last: AudioBufferSourceNode | null = null;
      for (;;) {
        const { value, done: end } = await reader.read();
        if (stopped) return { result: "stopped", timing };
        if (end) break;
        if (!value?.length) continue;
        const { samples, rest } = pcm16ToFloat32(value, carry);
        carry = rest;
        if (!samples.length) continue;
        const buf = ac.createBuffer(1, samples.length, rate);
        buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
        const src = ac.createBufferSource();
        src.buffer = buf;
        src.connect(ac.destination);
        const startAt = Math.max(next, ac.currentTime + LEAD_S);
        if (timing.firstSoundMs === null && ac.state === "running") {
          timing.firstSoundMs = Math.round(performance.now() - t0 + (startAt - ac.currentTime) * 1000);
          onFirstSound?.(timing.firstSoundMs);
        }
        src.start(startAt);
        next = startAt + buf.duration;
        sources.push(src);
        last = src;
      }
      if (!last) return { result: "error", timing };
      if (!stopped) await new Promise<void>((res) => { release = res; last!.onended = () => res(); });
      timing.totalMs = Math.round(performance.now() - t0);
      return { result: stopped ? "stopped" : "ended", timing };
    } catch {
      return { result: stopped ? "stopped" : "error", timing };
    }
  })();

  return { stop, done };
}
