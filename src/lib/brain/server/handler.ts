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
import { clientIp, crossOrigin, readBody } from "@/lib/http/request";
export { clientIp, readBody };
import { contextFor } from "@/lib/worlds/registry";
import { toolsFor } from "@/lib/scene/commands";

/** A signed-in parent as the route sees them. `consented` = current-wording consent is on file and not withdrawn. */
export interface ParentAccess { id: string; consented: boolean }

export interface Deps {
  /**
   * Who is signed in (verified server-side from the session cookie), or null. When absent, NO parent
   * can use the model: only the private-test passcode can. Closed by default, on purpose.
   */
  parent?: (req: Request) => Promise<ParentAccess | null>;
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
  // ACCESS. Runs after the per-IP limit (so passcode guesses and session lookups are rate limited) and before
  // the body is read or anything is spent. Nobody is anonymous here: either the private-test passcode, or a
  // signed-in parent whose consent is on file. The budget owner is the verified identity, never a browser-chosen id.
  const given = req.headers.get(TESTER_HEADER);
  let owner: string;
  if (d.env.testerCode && testerOk(d.env.testerCode, given)) {
    owner = "tester";
  } else {
    let p: ParentAccess | null = null;
    if (d.parent) {
      try { p = await d.parent(req); } catch { d.log("auth_error", { kind: 1 }); }
    }
    if (p) {
      if (!p.consented) return fail(403, "consent_required");
      owner = p.id;
    } else if (given || (d.env.testerCode && !d.parent)) {
      return fail(403, "tester_required"); // a passcode was offered and is wrong, or this deployment is passcode-only
    } else {
      return fail(401, "sign_in_required");
    }
  }

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > LIMITS.maxBodyBytes) return fail(413, "too_large");
  const raw = await readBody(req, LIMITS.maxBodyBytes, LIMITS.bodyReadTimeoutMs);
  if (!raw.ok) return raw.status === 413 ? fail(413, "too_large") : fail(400, "bad_request");
  let json: unknown;
  try { json = JSON.parse(raw.text); } catch { return fail(400, "bad_request"); }
  const parsed = parseRequest(json);
  if (!parsed.ok) return fail(400, "bad_request");
  const r = parsed.req;

  // Session and learner ids are chosen by the browser, so they are namespaced by the verified owner:
  // nobody can burn another family's counters by guessing their ids, and rotating ids buys nothing.
  const sessionKey = `${owner}:${r.sessionId}`;
  const sWait = d.sessionLimiter.take(sessionKey, now);
  if (sWait) return fail(429, "rate_limited", { "retry-after": String(sWait) });
  const done = d.sessionTotals.count(sessionKey, now);
  if (done === null) return fail(503, "global_limit"); // table full of live sessions: refuse new ones (never evict a live one)
  if (done >= LIMITS.perSessionTotal) return fail(429, "daily_limit");

  const ip = clientIp(req);
  const usage = await d.usage.today(`${owner}:${r.learnerId}`, r.tz, now);
  const ipDay = await d.usage.ipToday(ip, now);
  const parentDay = await d.usage.parentToday(owner, now);
  if (!usage || !ipDay || !parentDay) return fail(503, "global_limit"); // fail closed when a table is full of live keys
  if (usage.turns >= LIMITS.dailyTurnsPerLearner || ipDay.turns >= LIMITS.dailyTurnsPerIp || parentDay.turns >= LIMITS.dailyTurnsPerParent) return fail(429, "daily_limit");
  const global = await d.usage.globalToday(now);
  if (global.turns >= LIMITS.dailyTurnsGlobal) return fail(503, "global_limit");

  // Sonnet needs ALL budgets: this learner's, this parent's (a verified id, so rotating learnerId must not help), this client address's and the deployment's.
  const hard = isHardTurn(r)
    && usage.hardTurns < LIMITS.dailyHardTurnsPerLearner
    && parentDay.hardTurns < LIMITS.dailyHardTurnsPerParent
    && ipDay.hardTurns < LIMITS.dailyHardTurnsPerIp
    && global.hardTurns < LIMITS.dailyHardTurnsGlobal;
  await d.usage.reserve(usage, hard);
  await d.usage.reserveIp(ip, now, hard);
  await d.usage.reserveParent(owner, now, hard);
  await d.usage.reserveGlobal(now, hard);
  d.sessionTotals.add(sessionKey, now);

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
  if (!reply) {
    // Shape only (block types, stop reason, token count), never the child's words or the model's.
    const types = Array.isArray(up.content) ? up.content.slice(0, 8).map((x) => String((x as { type?: unknown })?.type ?? "?").slice(0, 16)).join(",") : "none";
    d.log("bad_model_output", { model: hard ? 1 : 0, blocks: types, stop: up.stopReason ?? "?", out: up.usage.output });
    return fail(502, "bad_model_output");
  }
  if (reply.dropped) d.log("dropped_parts", { count: reply.dropped });
  const body: BrainResponse = { segments: reply.segments, model: hard ? "hard" : "default" };
  return new Response(JSON.stringify(body), { status: 200, headers: HEADERS });
}

