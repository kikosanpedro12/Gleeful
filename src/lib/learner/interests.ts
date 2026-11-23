/**
 * The fixed list of interests a parent can pick for a child. ONE source of truth: the form, the
 * server-side validation and the tests read this. Keep in step with learners_interests_check in
 * supabase/migrations/20261123064826_learner_interests_name_say.sql (tests/interests.test.ts checks).
 * Free text is never stored: anything not in this list is rejected.
 */
export const INTERESTS = [
  { id: "animals", label: "Animals" },
  { id: "dinosaurs", label: "Dinosaurs" },
  { id: "ocean", label: "The ocean" },
  { id: "nature", label: "Nature" },
  { id: "space", label: "Space" },
  { id: "robots", label: "Robots" },
  { id: "vehicles", label: "Cars, trains and planes" },
  { id: "building", label: "Building things" },
  { id: "football", label: "Football" },
  { id: "basketball", label: "Basketball" },
  { id: "art", label: "Drawing and art" },
  { id: "music_dance", label: "Music and dance" },
  { id: "stories", label: "Stories" },
  { id: "superheroes", label: "Superheroes" },
  { id: "cooking", label: "Cooking" },
  { id: "games_puzzles", label: "Games and puzzles" },
  { id: "experiments", label: "Experiments" },
] as const;

export type InterestId = (typeof INTERESTS)[number]["id"];
export const MAX_INTERESTS = 5;
export const INTEREST_IDS: ReadonlySet<string> = new Set(INTERESTS.map((i) => i.id));
export const INTEREST_LABELS: ReadonlyMap<string, string> = new Map(INTERESTS.map((i) => [i.id, i.label]));
export const isInterestId = (v: unknown): v is InterestId => typeof v === "string" && INTEREST_IDS.has(v);
export const interestLabel = (id: string): string => INTEREST_LABELS.get(id) ?? id;

export const NAME_SAY_MAX = 40;
/** Same rule as learners_name_say_check: ASCII letters, spaces, hyphens, apostrophes; starts with a letter. */
export const NAME_SAY_RE = /^[A-Za-z][A-Za-z '-]*$/;

/** Empty or missing -> null (field cleared). Invalid -> undefined. Curly apostrophes become straight ones. */
export function cleanNameSay(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const v = raw.replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
  if (v === "") return null;
  return v.length <= NAME_SAY_MAX && NAME_SAY_RE.test(v) ? v : undefined;
}
