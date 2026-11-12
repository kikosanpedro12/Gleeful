import "server-only";
/**
 * Rate limits and daily usage for the brain route.
 *
 * HONEST STATUS: these tables live in this server instance's memory. On
 * serverless hosting each instance has its own copy and a restart clears it, so
 * this is an abuse brake, NOT the billing control. The hard ceiling is the
 * monthly spend limit on the Anthropic Console workspace. The `UsageStore`
 * interface exists so the same rules can move to public.brain_usage (Stage E)
 * without touching the handler.
 */
import { DEFAULT_TIME_ZONE, LIMITS } from "./config";

/** Fixed-window counter per key with a bounded table. */
export class RateLimiter {
  private hits = new Map<string, { windowStart: number; count: number }>();
  constructor(private max: number, private windowMs: number, private maxKeys: number = LIMITS.maxTrackedKeys) {}

  /** Returns 0 if allowed, otherwise the seconds to wait. */
  take(key: string, now: number): number {
    const e = this.hits.get(key);
    if (!e || now - e.windowStart >= this.windowMs) {
      this.hits.delete(key);
      this.hits.set(key, { windowStart: now, count: 1 });
      if (this.hits.size > this.maxKeys) this.hits.delete(this.hits.keys().next().value as string);
      return 0;
    }
    if (e.count >= this.max) return Math.max(1, Math.ceil((this.windowMs - (now - e.windowStart)) / 1000));
    e.count++;
    return 0;
  }
}

/** A valid IANA zone, else the default. Never throws. */
export function safeTimeZone(tz: unknown): string {
  if (typeof tz !== "string" || tz.length > 64) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** YYYY-MM-DD in the family's zone (NOT UTC: a UTC day would reset limits at 08:00 in Manila). */
export function dayKey(nowMs: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(nowMs));
}

export interface Usage { tz: string; day: string; turns: number; hardTurns: number; tokensIn: number; tokensOut: number }

export interface UsageStore {
  /** Today's usage for a learner. The zone is pinned on first sight: a client cannot move the day boundary by changing it. */
  today(learnerId: string, requestedTz: string, nowMs: number): Promise<Usage>;
  /** Count one turn before the model call (so a failing upstream cannot be hammered for free). */
  reserve(usage: Usage, hard: boolean): Promise<void>;
  addTokens(usage: Usage, tokensIn: number, tokensOut: number): Promise<void>;
  globalToday(nowMs: number): Promise<{ turns: number }>;
  reserveGlobal(nowMs: number): Promise<void>;
}

export class MemoryUsageStore implements UsageStore {
  private byLearner = new Map<string, Usage>();
  private pinnedTz = new Map<string, string>();
  private global = { day: "", turns: 0 };
  constructor(private maxKeys: number = LIMITS.maxTrackedKeys) {}

  async today(learnerId: string, requestedTz: string, nowMs: number): Promise<Usage> {
    let tz = this.pinnedTz.get(learnerId);
    if (!tz) {
      tz = safeTimeZone(requestedTz);
      this.pinnedTz.set(learnerId, tz);
      if (this.pinnedTz.size > this.maxKeys) this.pinnedTz.delete(this.pinnedTz.keys().next().value as string);
    }
    const day = dayKey(nowMs, tz);
    const key = learnerId;
    const cur = this.byLearner.get(key);
    if (cur && cur.day === day) return cur;
    const fresh: Usage = { tz, day, turns: 0, hardTurns: 0, tokensIn: 0, tokensOut: 0 };
    this.byLearner.delete(key);
    this.byLearner.set(key, fresh);
    if (this.byLearner.size > this.maxKeys) this.byLearner.delete(this.byLearner.keys().next().value as string);
    return fresh;
  }
  async reserve(u: Usage, hard: boolean) { u.turns++; if (hard) u.hardTurns++; }
  async addTokens(u: Usage, i: number, o: number) { u.tokensIn += i; u.tokensOut += o; }
  private globalDay(nowMs: number) {
    const d = dayKey(nowMs, "UTC");
    if (this.global.day !== d) this.global = { day: d, turns: 0 };
    return this.global;
  }
  async globalToday(nowMs: number) { return { turns: this.globalDay(nowMs).turns }; }
  async reserveGlobal(nowMs: number) { this.globalDay(nowMs).turns++; }
}
