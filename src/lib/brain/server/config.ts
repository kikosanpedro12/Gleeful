import "server-only";
/**
 * Stage B server configuration. Everything tunable lives here, in one place.
 * Nothing in this folder may be imported by client code (see the server-only
 * imports in route.ts and anthropic.ts).
 */
export const MODELS = {
  /** Default for almost every turn: fast and cheap. */
  default: "claude-haiku-5-5",
  /** Only for flagged hard turns (see isHardTurn). About 20x the price of default. */
  hard: "claude-sonnet-5-5",
} as const;

export const LIMITS = {
  /** Reply budget. Teacher lines are short; a long reply is a bug or an attack. */
  maxOutputTokens: 400,
  maxBodyBytes: 16 * 1024,
  maxTextChars: 300,
  maxHistoryTurns: 8,
  maxSkills: 10,
  maxSegments: 3,
  maxSayChars: 240,
  maxActionsPerSegment: 3,
  maxActionsPerReply: 6,
  upstreamTimeoutMs: 12_000,
  /** Per client address / per lesson session, per minute. */
  perIpPerMinute: 30,
  perSessionPerMinute: 20,
  /** A session is one lesson: far beyond a real lesson, far below abuse. */
  perSessionTotal: 200,
  /** Mirrors the design of public.brain_usage (per learner per day, in the family's time zone). */
  dailyTurnsPerLearner: 400,
  /** Sonnet turns are expensive; a stuck child gets a few, not unlimited. */
  dailyHardTurnsPerLearner: 20,
  /** Whole-deployment ceiling per day. A stand-in for the Console spend limit, never a replacement. */
  dailyTurnsGlobal: 5000,
  /** In-memory tables never grow past this many keys (oldest dropped first). */
  maxTrackedKeys: 5000,
} as const;

export const ESCALATE_TO_HARD_MODEL = true;
export const DEFAULT_TIME_ZONE = "Asia/Manila";

export interface BrainEnv {
  /** Present only on the server. Never logged, never returned. */
  apiKey: string | undefined;
  /** Set BRAIN_DISABLED=1 to stop all model calls at once (clients fall back to the script). */
  disabled: boolean;
}

export function readEnv(env: Record<string, string | undefined> = process.env): BrainEnv {
  const flag = (env.BRAIN_DISABLED ?? "").trim().toLowerCase();
  return {
    apiKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
    disabled: flag === "1" || flag === "true" || flag === "yes",
  };
}
