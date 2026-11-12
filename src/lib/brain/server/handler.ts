import "server-only";
/**
 * POST /api/brain, as a pure function of (Request, deps) so tests can run it
 * with a mocked Anthropic. Order matters: everything that costs nothing runs
 * before anything that costs money.
 *
 * Child speech is never logged. The only logged fields are error kinds and
 * HTTP status codes.
 */
import type { BrainEnv } from "./config";
import { LIMITS } from "./config";
import { callAnthropic, UpstreamError } from "./anthropic";
import { RateLimiter, type UsageStore } from "./limits";
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
  sessionTotals: Map<string, number>;
  /** Structured, content-free events only. */
  log: (event: string, fields: Record<string, string | number>) => void;
}

export function makeDeps(partial: Pick<Deps, "env" | "usage"> & Partial<Deps>): Deps {
  return {
    fetchImpl: (...a) => fetch(...a),
    now: () => Date.now(),
    ipLimiter: new RateLimiter(LIMITS.perIpPerMinute, 60_000),
    sessionLimiter: new RateLimiter(LIMITS.perSessionPerMinute, 60_000),
    sessionTotals: new Map(),
    log: (event, fields) => console.warn(`[brain] ${event}`, fields),
    ...partial,
  };
}

const HEADERS = { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" } as const;
const fail = (status: number, error: BrainErrorCode, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error }), { status, headers: { ...HEADERS, ...extra } });

export function clientIp(req: Request): string {
  const first = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(first) ? first : "unknown";
}

/** Same-origin only: a page on another site must not be able to spend our key. */
function crossOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  try { return new URL(origin).host !== host; } catch { return true; }
}

export async function handleBrain(req: Request, d: Deps): Promise<Response> {
  if (d.env.disabled) return fail(503, "brain_disabled");
  if (!d.env.apiKey) return fail(503, "brain_unconfigured");
  if (crossOrigin(req)) return fail(403, "forbidden_origin");
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return fail(415, "unsupported_media");

  const now = d.now();
  const wait = d.ipLimiter.take(clientIp(req), now);
  if (wait) return fail(429, "rate_limited", { "retry-after": String(wait) });

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > LIMITS.maxBodyBytes) return fail(413, "too_large");
  let text: string;
  try { text = await req.text(); } catch { return fail(400, "bad_request"); }
  if (text.length > LIMITS.maxBodyBytes) return fail(413, "too_large");
  let json: unknown;
  try { json = JSON.parse(text); } catch { return fail(400, "bad_request"); }
  const parsed = parseRequest(json);
  if (!parsed.ok) return fail(400, "bad_request");
  const r = parsed.req;

  const sWait = d.sessionLimiter.take(r.sessionId, now);
  if (sWait) return fail(429, "rate_limited", { "retry-after": String(sWait) });
  const done = d.sessionTotals.get(r.sessionId) ?? 0;
  if (done >= LIMITS.perSessionTotal) return fail(429, "daily_limit");

  const usage = await d.usage.today(r.learnerId, r.tz, now);
  if (usage.turns >= LIMITS.dailyTurnsPerLearner) return fail(429, "daily_limit");
  if ((await d.usage.globalToday(now)).turns >= LIMITS.dailyTurnsGlobal) return fail(503, "global_limit");

  const hard = isHardTurn(r) && usage.hardTurns < LIMITS.dailyHardTurnsPerLearner;
  await d.usage.reserve(usage, hard);
  await d.usage.reserveGlobal(now);
  d.sessionTotals.set(r.sessionId, done + 1);
  if (d.sessionTotals.size > LIMITS.maxTrackedKeys) d.sessionTotals.delete(d.sessionTotals.keys().next().value as string);

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

