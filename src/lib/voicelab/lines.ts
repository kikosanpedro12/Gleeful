/**
 * Voice A/B test data. The same five real lesson lines (greeting, transition, fact, kind re-explain, check) are
 * heard in each engine so a listener can compare like with like. Kokoro clips were generated OFFLINE with the
 * open-source Kokoro-82M model (Apache 2.0) and live in public/voice-lab (see ASSET_LICENSES.md). They are
 * samples for judging, not the shipped voice.
 */
export const LINES = [
  "Hello! Where should we go today?",
  "Hold on tight. Here comes Mars!",
  "Mars looks red because its rocks and dust have a lot of iron in them, and iron rusts.",
  "That's okay! Let's look at it a different way.",
  "Nice thinking! Can you tell me why, in your own words?",
] as const;

import type { TtsVoice } from "@/lib/tts/voices";
export type Teacher = "leo" | "mia";
export type EngineId = "browser" | "kokoro-a" | "dg-1" | "dg-2" | "dg-3" | "dg-4";

export interface Engine {
  id: EngineId;
  /** Revealed only after the listener has rated everything. */
  name: string;
  /** The voice behind the clip (Kokoro or Deepgram preset), or the device voice. */
  detail: (t: Teacher) => string;
  clip: (t: Teacher, line: number) => string | null;
  /** Deepgram Aura-2 voice (spoken live through /api/tts, passcode needed), or null. */
  voice?: (t: Teacher) => TtsVoice;
}

export const ENGINES: Engine[] = [
  { id: "browser", name: "This phone's built-in voice (what the app uses today)", detail: () => "browser speech", clip: () => null },
  { id: "kokoro-a", name: "Kokoro, voice 1 (open source, server)", detail: (t) => (t === "leo" ? "am_michael" : "af_heart"), clip: (t, i) => `/voice-lab/${t}-a-${i + 1}.mp3` },
  { id: "dg-1", name: "Deepgram Aura-2, voice 1 (paid API)", detail: (t) => (t === "leo" ? "apollo" : "amalthea"), clip: () => null, voice: (t) => (t === "leo" ? "aura-2-apollo-en" : "aura-2-amalthea-en") },
  { id: "dg-2", name: "Deepgram Aura-2, voice 2 (paid API)", detail: (t) => (t === "leo" ? "aries" : "thalia"), clip: () => null, voice: (t) => (t === "leo" ? "aura-2-aries-en" : "aura-2-thalia-en") },
  { id: "dg-3", name: "Deepgram Aura-2, voice 3 (paid API)", detail: (t) => (t === "leo" ? "arcas" : "luna"), clip: () => null, voice: (t) => (t === "leo" ? "aura-2-arcas-en" : "aura-2-luna-en") },
  { id: "dg-4", name: "Deepgram Aura-2, voice 4 (paid API)", detail: (t) => (t === "leo" ? "atlas" : "aurora"), clip: () => null, voice: (t) => (t === "leo" ? "aura-2-atlas-en" : "aura-2-aurora-en") },
];

export type Rating = "great" | "ok" | "robotic";

/** Deterministic Fisher-Yates so each line shows the engines in a different, unlabeled order. */
export function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export interface Tally { great: number; ok: number; robotic: number; unrated: number }
/** ratings[line][engine] */
export function tally(ratings: Partial<Record<EngineId, Rating>>[], lines = LINES.length): Record<EngineId, Tally> {
  const out = {} as Record<EngineId, Tally>;
  for (const e of ENGINES) {
    const t: Tally = { great: 0, ok: 0, robotic: 0, unrated: 0 };
    for (let i = 0; i < lines; i++) { const r = ratings[i]?.[e.id]; if (r) t[r]++; else t.unrated++; }
    out[e.id] = t;
  }
  return out;
}

export function summary(teacher: Teacher, t: Record<EngineId, Tally>): string {
  return [`Gleeful voice A/B (${teacher === "leo" ? "Leo" : "Mia"}), ${LINES.length} lines:`,
    ...ENGINES.map((e) => `- ${e.name} [${e.detail(teacher)}]: great ${t[e.id].great}, ok ${t[e.id].ok}, robotic ${t[e.id].robotic}${t[e.id].unrated ? `, not rated ${t[e.id].unrated}` : ""}`)].join("\n");
}
