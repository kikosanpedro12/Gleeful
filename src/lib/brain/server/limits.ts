import "server-only";
/**
 * Rate limits and daily usage for the brain route.
 *
 * HONEST STATUS: these tables live in this server instance's memory. On
 * serverless hosting each warm instance has its own copy and a cold start clears
 * it, so the real ceiling is (number of instances x these caps), not these caps.
 * They are an abuse BRAKE, not the billing control. The hard ceiling is the
 * monthly spend limit on the Anthropic Console workspace. The `UsageStore`
 * interface exists so the same rules can move to public.brain_usage (Stage E)
 * without touching the handler.
 *
 * FAIL CLOSED, NEVER EVICT: every table is bounded. When a table is full the
 * expired entries are purged, and if it is still full a NEW key is refused.
 * Evicting a live entry to make room would let an attacker reset a victim's
 * counters (or free a pinned time zone) just by sending requests with fresh ids.
 */
import { DEFAULT_TIME_ZONE, LIMITS } from "./config";

/** Fixed-window counter per key with a bounded table. */
export class RateLimiter {
  private hits = new Map<string, { windowStart: number; count: number }>();
  constructor(private max: number, private windowMs: number, private maxKeys: number = LIMITS.maxTrackedKeys) {}

  private purgeExpired(now: number) {
    for (const [k, e] of this.hits) if (now - e.windowStart >= this.windowMs) this.hits.delete(k);
  }

  /** Returns 0 if allowed, otherwise the seconds to wait. */
  take(key: string, now: number): number {
    const e = this.hits.get(key);
    if (e && now - e.windowStart < this.windowMs) {
      if (e.count >= this.max) return Math.max(1, Math.ceil((this.windowMs - (now - e.windowStart)) / 1000));
      e.count++;
      return 0;
    }
    if (!e && this.hits.size >= this.maxKeys) {
      this.purgeExpired(now);
      if (this.hits.size >= this.maxKeys) return Math.max(1, Math.ceil(this.windowMs / 1000)); // full of live keys: refuse the new one
    }
    this.hits.set(key, { windowStart: now, count: 1 });
    return 0;
  }
}

/** Per-session lifetime turn counts, bounded, idle sessions expire, never evicts a live one. */
export class SessionCounter {
  private m = new Map<string, { n: number; seen: number }>();
  constructor(private maxKeys: number = LIMITS.maxTrackedKeys, private idleMs: number = LIMITS.sessionIdleMs) {}

  /** Turns so far, or null when the table is full of live sessions (the caller must refuse). */
  count(id: string, now: number): number | null {
    const e = this.m.get(id);
    if (e) return e.n;
    if (this.m.size >= this.maxKeys) {
      for (const [k, v] of this.m) if (now - v.seen >= this.idleMs) this.m.delete(k);
      if (this.m.size >= this.maxKeys) return null;
    }
    return 0;
  }
  add(id: string, now: number) {
    const e = this.m.get(id);
    if (e) { e.n++; e.seen = now; } else this.m.set(id, { n: 1, seen: now });
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
export interface DayCount { turns: number; hardTurns: number }

export interface UsageStore {
  /**
   * Today's usage for a learner. The zone is pinned on first sight: a client cannot move the day boundary by changing it.
   * Returns null when the table is full of live learners (fail closed: the caller must refuse).
   */
  today(learnerId: string, requestedTz: string, nowMs: number): Promise<Usage | null>;
  /** Count one turn before the model call (so a failing upstream cannot be hammered for free). */
  reserve(usage: Usage, hard: boolean): Promise<void>;
  addTokens(usage: Usage, tokensIn: number, tokensOut: number): Promise<void>;
  /**
   * Whole-deployment and per-client-address counts use the UTC day on purpose:
   * the browser chooses its own time zone, so a zone-based day would let a client
   * move the boundary of a limit that is meant to bind it. (Only the per-learner
   * family limit uses the family's zone, with the zone pinned.) null = table full.
   */
  globalToday(nowMs: number): Promise<DayCount>;
  ipToday(ip: string, nowMs: number): Promise<DayCount | null>;
  reserveGlobal(nowMs: number, hard: boolean): Promise<void>;
  reserveIp(ip: string, nowMs: number, hard: boolean): Promise<void>;
  /**
   * Per signed-in parent (verified auth user id, or "tester"), UTC day. This is the
   * budget that rotating a browser-chosen learnerId or sessionId cannot reset.
   * null = table full of live parents (fail closed).
   */
  parentToday(parentId: string, nowMs: number): Promise<DayCount | null>;
  reserveParent(parentId: string, nowMs: number, hard: boolean): Promise<void>;
}

export class MemoryUsageStore implements UsageStore {
  private byLearner = new Map<string, Usage>();
  private byIp = new Map<string, { day: string; turns: number; hardTurns: number }>();
  private byParent = new Map<string, { day: string; turns: number; hardTurns: number }>();
  private global = { day: "", turns: 0, hardTurns: 0 };
  constructor(private maxKeys: number = LIMITS.maxTrackedKeys) {}

  async today(learnerId: string, requestedTz: string, nowMs: number): Promise<Usage | null> {
    const cur = this.byLearner.get(learnerId);
    if (cur) {
      // The zone stays pinned from the first sight; only the day label moves.
      const day = dayKey(nowMs, cur.tz);
      if (cur.day === day) return cur;
      cur.day = day; cur.turns = 0; cur.hardTurns = 0; cur.tokensIn = 0; cur.tokensOut = 0;
      return cur;
    }
    if (this.byLearner.size >= this.maxKeys) {
      // Only entries whose own day has passed are expired; live ones are never evicted.
      for (const [k, u] of this.byLearner) if (u.day !== dayKey(nowMs, u.tz)) this.byLearner.delete(k);
      if (this.byLearner.size >= this.maxKeys) return null;
    }
    const tz = safeTimeZone(requestedTz);
    const fresh: Usage = { tz, day: dayKey(nowMs, tz), turns: 0, hardTurns: 0, tokensIn: 0, tokensOut: 0 };
    this.byLearner.set(learnerId, fresh);
    return fresh;
  }
  async reserve(u: Usage, hard: boolean) { u.turns++; if (hard) u.hardTurns++; }
  async addTokens(u: Usage, i: number, o: number) { u.tokensIn += i; u.tokensOut += o; }

  private globalDay(nowMs: number) {
    const d = dayKey(nowMs, "UTC");
    if (this.global.day !== d) this.global = { day: d, turns: 0, hardTurns: 0 };
    return this.global;
  }
  async globalToday(nowMs: number) { const g = this.globalDay(nowMs); return { turns: g.turns, hardTurns: g.hardTurns }; }
  async reserveGlobal(nowMs: number, hard: boolean) { const g = this.globalDay(nowMs); g.turns++; if (hard) g.hardTurns++; }

  /** Per-key UTC-day counter in a bounded map. Never evicts a live key; a new key is refused (null) when the table is full. */
  private dayEntry(m: Map<string, { day: string; turns: number; hardTurns: number }>, key: string, nowMs: number, create: boolean) {
    const day = dayKey(nowMs, "UTC");
    const e = m.get(key);
    if (e) {
      if (e.day !== day) { e.day = day; e.turns = 0; e.hardTurns = 0; }
      return e;
    }
    if (!create) return null;
    if (m.size >= this.maxKeys) {
      for (const [k, v] of m) if (v.day !== day) m.delete(k);
      if (m.size >= this.maxKeys) return null;
    }
    const fresh = { day, turns: 0, hardTurns: 0 };
    m.set(key, fresh);
    return fresh;
  }
  async ipToday(ip: string, nowMs: number): Promise<DayCount | null> {
    const e = this.dayEntry(this.byIp, ip, nowMs, true);
    return e ? { turns: e.turns, hardTurns: e.hardTurns } : null;
  }
  async reserveIp(ip: string, nowMs: number, hard: boolean) {
    const e = this.dayEntry(this.byIp, ip, nowMs, false);
    if (e) { e.turns++; if (hard) e.hardTurns++; }
  }
  async parentToday(parentId: string, nowMs: number): Promise<DayCount | null> {
    const e = this.dayEntry(this.byParent, parentId, nowMs, true);
    return e ? { turns: e.turns, hardTurns: e.hardTurns } : null;
  }
  async reserveParent(parentId: string, nowMs: number, hard: boolean) {
    const e = this.dayEntry(this.byParent, parentId, nowMs, false);
    if (e) { e.turns++; if (hard) e.hardTurns++; }
  }
}
