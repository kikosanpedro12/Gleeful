import "server-only";
import { later } from "./later";
import { billingConfigured, db } from "@/lib/billing/store";
import { EVENT_INSERT_SQL } from "./cap";
import { eventForServerCounter, validateEvent, type EventCode, type EventContext, type ValidEvent } from "./codes";

/** What recordEvent needs from the outside; tests pass their own. */
export interface RecordDeps {
  configured: () => boolean;
  /** Runs the capped INSERT. Resolves whether or not a row was written (a repeat or a refused cap is not an error). */
  run: (e: ValidEvent) => Promise<void>;
  /** The longest a caller waits. The write itself may still finish afterwards. */
  deadlineMs: number;
}
export const defaultDeps: RecordDeps = {
  configured: billingConfigured,
  run: async (e) => { await db().unsafe(EVENT_INSERT_SQL, [e.code, e.parentId, e.utmSource, e.utmMedium, e.utmCampaign, e.referrerHost]); },
  deadlineMs: 800,
};

/**
 * Best effort, never throws. Does nothing when the billing database is not configured or the input is not valid
 * (see validateEvent). Waits at most `deadlineMs`, so a slow database cannot hold a response. COUNTS ONLY: callers pass a
 * code and, for parent events, the verified parent id; never a name, a message or an e-mail.
 * Resolves true only when the write finished without an error inside the deadline (a repeat the database ignored counts as done).
 */
export async function tryRecord(code: EventCode, ctx: EventContext = {}, deps: RecordDeps = defaultDeps): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!deps.configured()) return false;
    const e = validateEvent(code, ctx);
    if (!e) return false;
    const job = deps.run(e).then(() => true, () => false);
    return await Promise.race([job, new Promise<boolean>((r) => { timer = setTimeout(() => r(false), deps.deadlineMs); })]);
  } catch { return false; } finally { if (timer) clearTimeout(timer); }
}
export async function recordEvent(code: EventCode, ctx: EventContext = {}, deps: RecordDeps = defaultDeps): Promise<void> {
  await tryRecord(code, ctx, deps);
}

const MANILA = 8 * 3_600_000;
const manilaDay = (now: number) => new Date(now + MANILA).toISOString().slice(0, 10);
let seen = { day: "", ids: new Set<string>() };
const MAX_SEEN = 5000;

/**
 * "This parent was active today", sent once per warm instance per Manila day (the database dedupes across instances).
 * A parent is remembered only AFTER the write succeeded, so a failed or timed-out write is retried on their next turn. Never throws.
 */
export async function recordActiveDay(parentId: string, now: number = Date.now(), deps: RecordDeps = defaultDeps): Promise<void> {
  try {
    const day = manilaDay(now);
    if (seen.day !== day) seen = { day, ids: new Set() };
    if (seen.ids.has(parentId) || seen.ids.size >= MAX_SEEN) return;
    if (await tryRecord("active_day", { parentId }, deps)) {
      if (seen.day !== day) seen = { day, ids: new Set() };
      if (seen.ids.size < MAX_SEEN) seen.ids.add(parentId);
    }
  } catch { /* ignore */ }
}
export const resetActiveDayForTest = () => { seen = { day: "", ids: new Set() }; };

/** One error write per code per 10 s per warm instance: a flood of failures cannot turn into a flood of database writes. */
export const ERROR_WRITE_GAP_MS = 10_000;
const lastError = new Map<string, number>();
export function errorWriteAllowed(code: EventCode, now: number = Date.now()): boolean {
  const last = lastError.get(code);
  if (last !== undefined && now - last < ERROR_WRITE_GAP_MS && now >= last) return false;
  lastError.set(code, now);
  return true;
}
export const resetErrorThrottleForTest = () => lastError.clear();

/** Called from the in-memory server counters (src/lib/admin/events.ts): keeps the error ones in the database. Fire and forget, after the response where the platform allows. */
export function recordServerCounter(source: string, event: string): void {
  try {
    const code = eventForServerCounter(source, event);
    if (!code) return;
    if (!errorWriteAllowed(code)) return; // this instance already sent one for this code a moment ago
    later(() => recordEvent(code));
  } catch { /* ignore */ }
}
