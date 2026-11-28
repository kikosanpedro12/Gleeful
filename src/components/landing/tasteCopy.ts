/**
 * Pure helpers for the landing taste UI (tested in tests/tasteArc.test.ts).
 * Honesty: the paywall speaks to the grown-up, names what was just explored, and claims nothing that is not running.
 * Hooks are curiosity only: no urgency, guilt or streaks, and nothing aimed at the child about paying.
 */
import { choicesOk, topicOk } from "@/lib/taste/boardText";
import { greetingLine } from "@/lib/voice/greeting";

export type Chips = { kind: "ideas" | "choices" | "none"; items: string[] };

/** Starter ideas before the first question; afterwards only the tutor's own (re-validated) answers, never the starters. */
export function tapChips(a: { used: number; asked: number; choices: unknown; ideas: readonly string[]; last?: boolean }): Chips {
  if (a.last) return { kind: "none", items: [] }; // the last try is a tease, never a question
  if (a.used === 0 && a.asked === 0) return { kind: "ideas", items: [...a.ideas] };
  if (choicesOk(a.choices)) return { kind: "choices", items: [...a.choices] };
  return { kind: "none", items: [] };
}

export function paywallCopy(name: string | null, topic: unknown): { heading: string; body: string } {
  const who = name ?? "Your tutor";
  const whoMid = name ?? "your tutor"; // mid-sentence: no stray capital
  const t = topicOk(topic) ? topic : null;
  return {
    heading: t ? `That was ${t}, with ${who}.` : `${who} has so much more to show your child.`,
    body: `In a full lesson, ${whoMid} keeps going from here${t ? ` with ${t}` : ""}: pictures on the board, a question back at every step, and a parent view of what stuck.`,
  };
}

/** One quiet sample question for a child who would stall at an empty box. The rotating placeholder covers the rest. */
export const STARTERS = [
  { ask: "Why is Mars red?", say: "why Mars is red" },
] as const;

/**
 * The tutor's first line after the pick, fixed text (no model call, not a try, never ElevenLabs): a greeting and one open question.
 * It claims nothing the page is not doing; the card already says it is a live AI tutor and can be wrong.
 */
export const openerLine = (name: string) => greetingLine(name);
