import type { Standard } from "./types";

/**
 * Which 3D environment a standard is taught in. Environments marked built exist in
 * src/lib/worlds/registry.ts; planned ones are the Scene Kit list (docs: Scene Kit spec).
 * A standard with no rule is "unmapped": the teacher falls back to speech plus the text
 * board, and the gap is counted here, never hidden.
 */
export type EnvId =
  | "classroom" | "planet_surface" | "market" // built
  | "lab" | "ancient_city" | "ocean_floor" | "cell" | "ecosystem" | "map_room" | "studio" | "kitchen" | "playground"; // planned

export const BUILT_ENVS: readonly EnvId[] = ["classroom", "planet_surface", "market"];

interface Rule { env: EnvId; when: RegExp; subjects?: string[] }

// First match wins. Keep rules about the topic, not the grade.
const RULES: Rule[] = [
  { env: "planet_surface", when: /\b(planet|solar system|space|moon|sun|stars?|orbit|gravity|earth.s place|universe|mars)\b/i },
  { env: "market", subjects: ["math"], when: /\b(money|peso|percent|discount|interest|rate|division|divide|multipl|fraction|decimal|ratio|price|financial|ordinal|addition|subtract)\b/i },
  { env: "ocean_floor", when: /\b(ocean|water cycle|marine|sea|coral|tides?)\b/i },
  { env: "cell", when: /\b(cell|molecule|organ|heredity|genetic|dna|microscop|organism)\b/i },
  { env: "ecosystem", when: /\b(ecosystem|habitat|food chain|plants?|animals?|biodiversity|environment|trees|living things|natural resources|sustainab)\b/i },
  { env: "lab", subjects: ["science"], when: /\b(matter|energy|force|motion|waves?|light|sound|electric|chemical|reaction|atom|mixtures?|materials|engineering|design)\b/i },
  { env: "ancient_city", when: /\b(ancient|civilization|colonial|imperial|nationalis|independence|history|asean|empire|philippine territory|heroes|customs)\b/i },
  { env: "map_room", when: /\b(map|globe|location|geograph|territory|climate|region)\b/i },
  { env: "studio", subjects: ["english", "filipino", "reading", "language"], when: /\b(writ|speak|text|story|poem|narrative|letter|read|listen|literary|informational|vocabulary|grammar|sentence)\b/i },
  { env: "kitchen", when: /\b(cook|food|nutrition|home|household|cleanliness|hygiene|livelihood)\b/i },
  { env: "playground", when: /\b(respect|kindness|friend|share|rights|sincerity|honesty|helpful|conduct|values|prayer|thrift)\b/i },
];

// Subjects that have a sensible default home even if no keyword hit.
const SUBJECT_DEFAULT: Record<string, EnvId> = {
  math: "classroom", english: "studio", science: "lab", ap: "map_room", gmrc: "playground",
};

export function envFor(s: Pick<Standard, "subject" | "domain" | "text" | "cluster">): EnvId | "unmapped" {
  const hay = `${s.domain} ${s.cluster ?? ""} ${s.text}`;
  for (const r of RULES) {
    if (r.subjects && !r.subjects.includes(s.subject)) continue;
    if (r.when.test(hay)) return r.env;
  }
  return Object.hasOwn(SUBJECT_DEFAULT, s.subject) ? SUBJECT_DEFAULT[s.subject]! : "unmapped";
}

export interface Coverage { built: number; planned: Record<string, number>; unmapped: number; total: number }

export function coverage(list: readonly Pick<Standard, "subject" | "domain" | "text" | "cluster">[]): Coverage {
  const c: Coverage = { built: 0, planned: {}, unmapped: 0, total: list.length };
  for (const s of list) {
    const e = envFor(s);
    if (e === "unmapped") c.unmapped++;
    else if (BUILT_ENVS.includes(e)) c.built++;
    else c.planned[e] = (c.planned[e] ?? 0) + 1;
  }
  return c;
}
