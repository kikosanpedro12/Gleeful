import "server-only";
/**
 * POST /api/brain, as a pure function of (Request, deps) so tests can run it
 * with a mocked Anthropic. Order matters: everything that costs nothing runs
 * before anything that costs money.
 *
 * Child speech is never logged. The only logged fields are error kinds and
 * HTTP status codes.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { BrainEnv } from "./config";
import { TESTER_HEADER } from "../tester";
import { LIMITS } from "./config";
import { callAnthropic, UpstreamError } from "./anthropic";
import { RateLimiter, SessionCounter, type UsageStore } from "./limits";
import { buildSystem, buildUserMessage, isHardTurn, modelFor } from "./prompt";
import { parseRequest } from "./request";
import { buildReply } from "./sanitize";
import type { BrainErrorCode, BrainResponse } from "../protocol";
import { contextFor } from "@/lib/worlds/registry";
import { toolsFor } from "@/lib/scene/commands";

export interface Deps {
  fetchImpl: typeof fetch;
  env: BrainEnv;
  now: () => number;
  usage: UsageStore;
  ipLimiter: RateLimiter;
  sessionLimiter: RateLimiter;
  sessionTotals: SessionCounter;
  /** Structured, content-free events only. */
  log: (event: string, fields: Record<string, string | number>) => void;
}

export function makeDeps(partial: Pick<Deps, "env" | "usage"> & Partial<Deps>): Deps {
  return {
    fetchImpl: (...a) => fetch(...a),
    now: () => Date.now(),
    ipLimiter: new RateLimiter(LIMITS.perIpPerMinute, 60_000),
    sessionLimiter: new RateLimiter(LIMITS.perSessionPerMinute, 60_000),
    sessionTotals: new SessionCounter(),
    log: (event, fields) => console.warn(`[brain] ${event}`, fields),
    ...partial,
  };
}

const HEADERS = { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" } as const;
const fail = (status: number, error: BrainErrorCode, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error }), { status, headers: { ...HEADERS, ...extra } });

/** The header that carries the private-test passcode (one name, shared with the browser side). */
export { TESTER_HEADER };

/**
 * Constant-time passcode check. Both sides are hashed first so the comparison
 * takes the same time whatever the lengths, and a wrong guess reveals nothing.
 */
export function testerOk(expected: string | undefined, given: string | null): boolean {
  if (!expected) return true; // gate off
  if (!given) return false;
  const a = createHash("sha256").update(expected, "utf8").digest();
  const b = createHash("sha256").update(given.slice(0, 200), "utf8").digest();
  return timingSafeEqual(a, b);
}

export function clientIp(req: Request): string {
  const first = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(first) ? first : "unknown";
}

/**
 * Same-origin only: a page on another site must not be able to spend our key.
 *
 * DECISION: a request with NEITHER Origin nor Sec-Fetch-Site is allowed. Every
 * browser sends at least one of them on a POST, so a cross-site web page cannot
 * omit both; only non-browser clients (curl, scripts) do, and they can forge
 * either header anyway. This check is CSRF protection for browsers, NOT a spend
 * control. Spend is controlled by the rate limits, the daily caps and the
 * Console spend limit.
 */
function crossOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  try { return new URL(origin).host !== host; } catch { return true; }
}

/**
 * Reads the body with a hard cap on BYTES (not characters) and a time limit, so a
 * chunked or slow-drip request cannot hold the function open or fill memory.
 */
export async function readBody(req: Request, maxBytes: number, timeoutMs: number): Promise<{ ok: true; text: string } | { ok: false; status: 400 | 413 }> {
  if (!req.body) return { ok: true, text: "" };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, timeoutMs);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { void reader.cancel().catch(() => {}); return { ok: false, status: 413 }; }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400 };
  } finally {
    clearTimeout(timer);
  }
  if (timedOut) return { ok: false, status: 400 };
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { all.set(c, off); off += c.byteLength; }
  try { return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(all) }; } catch { return { ok: false, status: 400 }; }
}

/** Logged once per server instance; never includes the code or its length. */
let warnedMisconfigured = false;
export function warnTesterMisconfigured() {
  if (warnedMisconfigured) return;
  warnedMisconfigured = true;
  console.warn("[brain] BRAIN_TESTER_CODE is shorter than 16 characters: model calls are refused until it is fixed.");
}

export async function handleBrain(req: Request, d: Deps): Promise<Response> {
  if (d.env.disabled) return fail(503, "brain_disabled");
  if (!d.env.apiKey) return fail(503, "brain_unconfigured");
  if (d.env.testerMisconfigured) { warnTesterMisconfigured(); return fail(503, "brain_unconfigured"); }
  if (crossOrigin(req)) return fail(403, "forbidden_origin");
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return fail(415, "unsupported_media");

  const now = d.now();
  const wait = d.ipLimiter.take(clientIp(req), now);
  if (wait) return fail(429, "rate_limited", { "retry-after": String(wait) });
  // After the per-IP limit, so guesses are rate limited; before the body is read or anything is spent.
  if (!testerOk(d.env.testerCode, req.headers.get(TESTER_HEADER))) return fail(403, "tester_required");

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > LIMITS.maxBodyBytes) return fail(413, "too_large");
  const raw = await readBody(req, LIMITS.maxBodyBytes, LIMITS.bodyReadTimeoutMs);
  if (!raw.ok) return raw.status === 413 ? fail(413, "too_large") : fail(400, "bad_request");
  let json: unknown;
  try { json = JSON.parse(raw.text); } catch { return fail(400, "bad_request"); }
  const parsed = parseRequest(json);
  if (!parsed.ok) return fail(400, "bad_request");
  const r = parsed.req;

  const sWait = d.sessionLimiter.take(r.sessionId, now);
  if (sWait) return fail(429, "rate_limited", { "retry-after": String(sWait) });
  const done = d.sessionTotals.count(r.sessionId, now);
  if (done === null) return fail(503, "global_limit"); // table full of live sessions: refuse new ones (never evict a live one)
  if (done >= LIMITS.perSessionTotal) return fail(429, "daily_limit");

  const ip = clientIp(req);
  const usage = await d.usage.today(r.learnerId, r.tz, now);
  const ipDay = await d.usage.ipToday(ip, now);
  if (!usage || !ipDay) return fail(503, "global_limit"); // fail closed when a table is full of live keys
  if (usage.turns >= LIMITS.dailyTurnsPerLearner || ipDay.turns >= LIMITS.dailyTurnsPerIp) return fail(429, "daily_limit");
  const global = await d.usage.globalToday(now);
  if (global.turns >= LIMITS.dailyTurnsGlobal) return fail(503, "global_limit");

  // Sonnet needs ALL budgets: this learner's, this client address's (learnerId is browser-chosen, so rotating it must not help) and the deployment's.
  const hard = isHardTurn(r)
    && usage.hardTurns < LIMITS.dailyHardTurnsPerLearner
    && ipDay.hardTurns < LIMITS.dailyHardTurnsPerIp
    && global.hardTurns < LIMITS.dailyHardTurnsGlobal;
  await d.usage.reserve(usage, hard);
  await d.usage.reserveIp(ip, now, hard);
  await d.usage.reserveGlobal(now, hard);
  d.sessionTotals.add(r.sessionId, now);

  const ctx = contextFor(r.world);
  let up;
  try {
    up = await callAnthropic({
      fetchImpl: d.fetchImpl, apiKey: d.env.apiKey, model: modelFor(hard),
      system: buildSystem(r), user: buildUserMessage(r), tools: toolsFor(ctx),
    });
  } catch (e) {
    const err = e instanceof UpstreamError ? e : new UpstreamError("failed");
    d.log("upstream_error", { kind: err.kind, status: err.status ?? 0 });
    if (err.kind === "timeout") return fail(504, "upstream_timeout");
    if (err.kind === "busy") return fail(503, "upstream_busy", { "retry-after": "5" });
    return fail(502, "upstream_failed");
  }
  await d.usage.addTokens(usage, up.usage.input, up.usage.output);

  const reply = buildReply(up.content, r.world, r.input);
  if (!reply) { d.log("bad_model_output", { model: hard ? 1 : 0 }); return fail(502, "bad_model_output"); }
  if (reply.dropped) d.log("dropped_parts", { count: reply.dropped });
  const body: BrainResponse = { segments: reply.segments, model: hard ? "hard" : "default" };
  return new Response(JSON.stringify(body), { status: 200, headers: HEADERS });
}

