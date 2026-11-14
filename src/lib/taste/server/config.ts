import "server-only";
/**
 * Caps for the anonymous landing taste. This path is deliberately SEPARATE from /api/brain:
 * no sign-in, no tester code, no tools, no history of the child, and the cheap model only.
 * The model is a constant (MODELS.default). There is no way for a request, a header or an
 * environment variable to select another model on this path.
 */
import { MODELS } from "@/lib/brain/server/config";

export const TASTE_MODEL = MODELS.default;

export const TASTE_LIMITS = {
  /** Token ceiling for thinking + reply together. The visible reply is still capped by maxReplyChars. */
  maxOutputTokens: 600,
  /** Longest reply we will pass on, in characters (after cleaning). */
  maxReplyChars: 280,
  maxBodyBytes: 2 * 1024,
  maxHistory: 4,
  maxHistoryChars: 280,
  bodyReadTimeoutMs: 3_000,
  /** Per client address, per minute. */
  perIpPerMinute: 6,
  /** Questions per page view (the cap that the visitor sees). */
  perSessionTurns: 3,
  /** Defaults for the two env-tunable ceilings, and the most the env may raise them to. */
  defaultPerIpDaily: 9,
  maxPerIpDaily: 60,
  defaultGlobalDaily: 600,
  maxGlobalDaily: 5000,
} as const;

export interface TasteEnv {
  apiKey: string | undefined;
  /** TASTE_DISABLED=1 stops the taste only (BRAIN_DISABLED stops it too). */
  disabled: boolean;
  perIpDaily: number;
  globalDaily: number;
}

const flag = (v: string | undefined) => ["1", "true", "yes"].includes((v ?? "").trim().toLowerCase());

/** A whole number within [min, max]; anything else (missing, NaN, negative, huge) falls back to the default. */
export function boundedInt(raw: string | undefined, dflt: number, min: number, max: number): number {
  const t = (raw ?? "").trim();
  if (!/^\d{1,6}$/.test(t)) return dflt;
  const n = Number(t);
  return n >= min && n <= max ? n : dflt;
}

export function readTasteEnv(env: Record<string, string | undefined> = process.env): TasteEnv {
  return {
    apiKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
    disabled: flag(env.TASTE_DISABLED) || flag(env.BRAIN_DISABLED),
    perIpDaily: boundedInt(env.TASTE_DAILY_TURNS_PER_IP, TASTE_LIMITS.defaultPerIpDaily, 1, TASTE_LIMITS.maxPerIpDaily),
    globalDaily: boundedInt(env.TASTE_DAILY_TURNS_GLOBAL, TASTE_LIMITS.defaultGlobalDaily, 1, TASTE_LIMITS.maxGlobalDaily),
  };
}
