import "server-only";
/**
 * Stage B server configuration. Everything tunable lives here, in one place.
 * Nothing in this folder may be imported by client code (see the server-only
 * imports in route.ts and anthropic.ts).
 */
export const MODELS = {
  /** Default for almost every turn: fast and cheap. */
  default: "claude-haiku-5-5",
  /** Only for flagged hard turns (see isHardTurn). Priced higher per token; published prices are recorded in docs/COSTS.md. */
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
  /**
   * The same budget keyed on the client address, because learnerId is chosen by
   * the browser and rotating it must not buy more Sonnet turns. A household
   * shares one address, so this is above one learner's budget but far below abuse.
   */
  dailyHardTurnsPerIp: 40,
  /** All turns per client address per day (also not resettable by rotating learnerId). */
  dailyTurnsPerIp: 1500,
  /** Whole-deployment ceilings per day. A stand-in for the Console spend limit, never a replacement. */
  dailyTurnsGlobal: 5000,
  dailyHardTurnsGlobal: 300,
  /** Reading the request body must finish within this, however slowly the client sends it. */
  bodyReadTimeoutMs: 5_000,
  /**
   * In-memory tables never grow past this many keys. When full, a NEW key is
   * refused (fail closed) after expired entries are purged. Evicting a live
   * entry instead would let an attacker reset a victim's counters by flooding.
   */
  maxTrackedKeys: 5000,
  /** A session counter idle this long is expired and may be purged when the table is full. */
  sessionIdleMs: 2 * 60 * 60_000,
} as const;

export const ESCALATE_TO_HARD_MODEL = true;
export const DEFAULT_TIME_ZONE = "Asia/Manila";

export interface BrainEnv {
  /** Present only on the server. Never logged, never returned. */
  apiKey: string | undefined;
  /** Set BRAIN_DISABLED=1 to stop all model calls at once (clients fall back to the script). */
  disabled: boolean;
  /**
   * Private-test passcode (BRAIN_TESTER_CODE). When set, every POST must carry it in the
   * `x-gleeful-tester` header or it is refused with 403 before any model call. A stopgap that
   * lets a real key sit behind a public URL during a private test, NOT a replacement for
   * parent sign-in. Use 16+ random characters.
   */
  testerCode?: string;
  /**
   * BRAIN_TESTER_CODE is set but shorter than TESTER_CODE_MIN: treated as a
   * misconfiguration (a short code is guessable), so model calls are refused and
   * the script answers. Fails closed rather than running with a weak gate.
   */
  testerMisconfigured?: boolean;
}

/** Shortest accepted private-test passcode. */
export const TESTER_CODE_MIN = 16;

export function readEnv(env: Record<string, string | undefined> = process.env): BrainEnv {
  const flag = (env.BRAIN_DISABLED ?? "").trim().toLowerCase();
  const tester = env.BRAIN_TESTER_CODE?.trim() ?? "";
  return {
    apiKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
    disabled: flag === "1" || flag === "true" || flag === "yes",
    testerCode: tester || undefined,
    testerMisconfigured: !!tester && tester.length < TESTER_CODE_MIN,
  };
}
