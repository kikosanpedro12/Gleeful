import "server-only";
/**
 * POST /api/taste and GET /api/taste: the anonymous "ask the teacher" box on the landing page.
 *
 * A SEPARATE path from /api/brain, on purpose. Anyone can reach it, so it can do almost nothing:
 *  - the cheap model only (constant TASTE_MODEL), no tools, a small reply cap;
 *  - no sign-in, no tester code, no cookies, no learner data, no lesson state;
 *  - at most 3 questions per page view, a small daily budget per client address, and a daily
 *    budget for the whole deployment (env-tunable, hard-capped in config.ts);
 *  - every table is bounded and FAILS CLOSED: when it is full of live keys, a new key is refused.
 *
 * HONEST STATUS: the counters live in this server instance's memory, so on serverless hosting the
 * real ceiling is (warm instances x these caps) and a cold start clears them. They are a BRAKE.
 * The ceiling is the monthly spend limit on the Anthropic Console workspace.
 *
 * What the visitor types is never logged. Only error kinds and status codes are.
 */
import { callAnthropic, UpstreamError } from "@/lib/brain/server/anthropic";
import { MemoryUsageStore, RateLimiter, SessionCounter, type UsageStore } from "@/lib/brain/server/limits";
import { looksLikeNarration, sanitizeSay } from "@/lib/brain/server/sanitize";
import { clientIp, crossOrigin, readBody } from "@/lib/http/request";
import { cleanText } from "@/lib/scene/commands";
import { TASTE_MAX_TURNS, type TasteErrorCode, type TasteResponse, type TasteStatus } from "../protocol";
import { TASTE_LIMITS, TASTE_MODEL, type TasteEnv } from "./config";
import { TASTE_SYSTEM, buildTasteUser } from "./prompt";
import { parseTasteRequest } from "./request";

export interface TasteDeps {
  fetchImpl: typeof fetch;
  env: TasteEnv;
  now: () => number;
  /** Its own instance, never shared with /api/brain: the two budgets cannot eat each other. */
  usage: UsageStore;
  ipLimiter: RateLimiter;
  sessions: SessionCounter;
  log: (event: string, fields: Record<string, string | number>) => void;
}

export function makeTasteDeps(partial: Pick<TasteDeps, "env"> & Partial<TasteDeps>): TasteDeps {
  return {
    fetchImpl: (...a) => fetch(...a),
    now: () => Date.now(),
    usage: new MemoryUsageStore(),
    ipLimiter: new RateLimiter(TASTE_LIMITS.perIpPerMinute, 60_000),
    sessions: new SessionCounter(),
    log: (event, fields) => console.warn(`[taste] ${event}`, fields),
    ...partial,
  };
}

const HEADERS = { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" } as const;
const fail = (status: number, error: TasteErrorCode, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error }), { status, headers: { ...HEADERS, ...extra } });

/** Can a question sent right now be answered? Reads counters, never writes (a GET must not fill a table). */
export async function tasteStatus(d: Pick<TasteDeps, "env" | "usage" | "now">): Promise<TasteStatus> {
  const e = d.env;
  if (!e.apiKey || e.disabled) return { available: false, maxTurns: TASTE_MAX_TURNS };
  const g = await d.usage.globalToday(d.now());
  return { available: g.turns < e.globalDaily, maxTurns: TASTE_MAX_TURNS };
}

export async function handleTaste(req: Request, d: TasteDeps): Promise<Response> {
  if (d.env.disabled || !d.env.apiKey) return fail(503, "taste_unavailable");
  if (crossOrigin(req)) return fail(403, "forbidden_origin");
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return fail(415, "unsupported_media");

  const now = d.now();
  const ip = clientIp(req);
  const wait = d.ipLimiter.take(ip, now);
  if (wait) return fail(429, "rate_limited", { "retry-after": String(wait) });

  if (Number(req.headers.get("content-length") ?? 0) > TASTE_LIMITS.maxBodyBytes) return fail(413, "too_large");
  const raw = await readBody(req, TASTE_LIMITS.maxBodyBytes, TASTE_LIMITS.bodyReadTimeoutMs);
  if (!raw.ok) return raw.status === 413 ? fail(413, "too_large") : fail(400, "bad_request");
  let json: unknown;
  try { json = JSON.parse(raw.text); } catch { return fail(400, "bad_request"); }
  const parsed = parseTasteRequest(json);
  if (!parsed.ok) return fail(400, "bad_request");
  const r = parsed.req;

  // Budgets, cheapest check first. Anything refused here costs nothing.
  const sessionKey = `${ip}:${r.tasteId}`;
  const done = d.sessions.count(sessionKey, now);
  if (done === null) return fail(503, "taste_busy"); // table full of live sessions: refuse new ones, never evict a live one
  if (done >= TASTE_LIMITS.perSessionTurns) return fail(429, "taste_over");
  const ipDay = await d.usage.ipToday(ip, now);
  if (!ipDay) return fail(503, "taste_busy");
  if (ipDay.turns >= d.env.perIpDaily) return fail(429, "taste_over");
  const global = await d.usage.globalToday(now);
  if (global.turns >= d.env.globalDaily) return fail(503, "taste_busy");

  // Counted BEFORE the call, so a failing upstream cannot be hammered for free. hard=false: there is no hard path here.
  await d.usage.reserveIp(ip, now, false);
  await d.usage.reserveGlobal(now, false);
  d.sessions.add(sessionKey, now);

  // One automatic retry if the model returned nothing usable (the visitor never sees a blank-answer error for that).
  let reply: string | null = null;
  for (let attempt = 0; attempt < 2 && !reply; attempt++) {
    let up;
    try {
      up = await callAnthropic({
        fetchImpl: d.fetchImpl, apiKey: d.env.apiKey, model: TASTE_MODEL,
        system: TASTE_SYSTEM, user: buildTasteUser(r), maxTokens: TASTE_LIMITS.maxOutputTokens,
        // no `tools`: the request carries none, so the model cannot call anything
      });
    } catch (e) {
      const err = e instanceof UpstreamError ? e : new UpstreamError("failed");
      d.log("upstream_error", { kind: err.kind, status: err.status ?? 0 });
      if (err.kind === "timeout") return fail(504, "upstream_timeout");
      if (err.kind === "busy") return fail(503, "upstream_busy", { "retry-after": "5" });
      return fail(502, "upstream_failed");
    }
    reply = cleanReply(up.content);
    if (!reply) {
      // Types and counts only, never the visitor's words or the model's.
      const types = Array.isArray(up.content) ? up.content.slice(0, 6).map((b) => String((b as { type?: unknown })?.type ?? "?").slice(0, 16)).join(",") : "none";
      d.log("bad_model_output", { attempt: attempt + 1, blocks: types, stop: up.stopReason ?? "?", out: up.usage.output });
    }
  }
  if (!reply) return fail(502, "bad_model_output");
  const body: TasteResponse = { reply, turnsLeft: Math.max(0, TASTE_LIMITS.perSessionTurns - (done + 1)) };
  return new Response(JSON.stringify(body), { status: 200, headers: HEADERS });
}

/**
 * Whatever the model sent: text blocks only (a tool_use block, if one ever appeared, is ignored),
 * links and markup stripped by the same sanitizer the lessons use, at most two sentences' worth, capped.
 */
export function cleanReply(blocks: unknown): string | null {
  if (!Array.isArray(blocks)) return null;
  const parts: string[] = [];
  for (const b of blocks.slice(0, 8)) {
    if (!b || typeof b !== "object" || (b as { type?: unknown }).type !== "text") continue;
    const s = sanitizeSay((b as { text?: unknown }).text, TASTE_LIMITS.maxReplyChars);
    if (s && !looksLikeNarration(s)) parts.push(s);
    if (parts.length >= 2) break;
  }
  return cleanText(parts.join(" "), TASTE_LIMITS.maxReplyChars);
}
