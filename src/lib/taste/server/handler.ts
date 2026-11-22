import { recordEvent } from "@/lib/admin/events";
import "server-only";
/**
 * POST /api/taste and GET /api/taste: the anonymous "ask the teacher" box on the landing page.
 *
 * A SEPARATE path from /api/brain, on purpose. Anyone can reach it, so it can do almost nothing:
 *  - the cheap model only (constant TASTE_MODEL), no tools, a small reply cap;
 *  - no sign-in, no tester code, no learner data, no lesson state; its only cookie is the signed tries counter (cookie.ts);
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
import { looksLikeNarration, sanitizeSay, unsafeOutput } from "@/lib/brain/server/sanitize";
import { clientIp, crossOrigin, readBody } from "@/lib/http/request";
import { cleanText, GESTURES, parseSceneCommand } from "@/lib/scene/commands";
import { contextFor } from "@/lib/worlds/registry";
import { parseFrame, frameToArgs } from "@/lib/scene/frame";
import { BOARD_MAX, CHOICE_MAX, TASTE_MAX_TURNS, TOPIC_MAX, type TasteErrorCode, type TasteResponse, type TasteStatus } from "../protocol";
import { choicesOk, topicOk } from "../boardText";
import { TASTE_LIMITS, TASTE_MODEL, type TasteEnv } from "./config";
import { TASTE_WORLD, buildTasteUser, tasteSystem } from "./prompt";
import { parseTasteRequest } from "./request";
import { cookieSecret, makeTasteCookie, readCookieHeader, verifyTasteCookie } from "./cookie";

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
    log: (event, fields) => { recordEvent("taste", event); console.warn(`[taste] ${event}`, fields); },
    ...partial,
  };
}

const HEADERS = { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" } as const;
const fail = (status: number, error: TasteErrorCode, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error }), { status, headers: { ...HEADERS, ...extra } });

/** Can a question sent right now be answered? Reads counters, never writes (a GET must not fill a table). */
export async function tasteStatus(d: Pick<TasteDeps, "env" | "usage" | "now">, req?: Request): Promise<TasteStatus> {
  const e = d.env;
  if (!e.apiKey || e.disabled) return { available: false, maxTurns: TASTE_MAX_TURNS };
  const g = await d.usage.globalToday(d.now());
  const secret = cookieSecret({ TASTE_COOKIE_SECRET: e.cookieSecret, ANTHROPIC_API_KEY: e.apiKey });
  const c = secret && req ? verifyTasteCookie(readCookieHeader(req.headers.get("cookie")), secret, d.now()) : null;
  const used = c && c !== "bad" ? Math.min(c.used, TASTE_MAX_TURNS) : 0;
  return { available: g.turns < e.globalDaily && used < TASTE_MAX_TURNS, maxTurns: TASTE_MAX_TURNS, used };
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

  // The signed cookie is the per-person count: a refresh does not reset it. A forged, damaged or old-secret cookie is NOT "all used": it starts a fresh window (see below), which the per-address and site caps still bound.
  const secret = cookieSecret({ TASTE_COOKIE_SECRET: d.env.cookieSecret, ANTHROPIC_API_KEY: d.env.apiKey });
  if (!secret) return fail(503, "taste_unavailable");
  const ck = verifyTasteCookie(readCookieHeader(req.headers.get("cookie")), secret, now);
  const usedBefore = ck && ck !== "bad" ? ck.used : 0; // damaged/forged/old-secret cookie = a fresh window (self-heals); omitting it would gain the same
  const ckExp = ck && ck !== "bad" ? ck.exp : undefined;
  if (usedBefore >= TASTE_LIMITS.perSessionTurns) return fail(429, "taste_over");

  // Budgets, cheapest check first. Anything refused here costs nothing.
  const sessionKey = `${ip}:${r.tasteId}`;
  const done = d.sessions.count(sessionKey, now);
  if (done === null) return fail(503, "taste_busy"); // table full of live sessions: refuse new ones, never evict a live one
  if (done >= TASTE_LIMITS.perSessionTurns) return fail(429, "taste_over");
  const ipDay = await d.usage.ipToday(ip, now);
  if (!ipDay) return fail(503, "taste_busy");
  if (ipDay.turns >= d.env.perIpDaily) return fail(503, "taste_busy"); // this address is out for today: not "your 3 are used"
  const global = await d.usage.globalToday(now);
  if (global.turns >= d.env.globalDaily) return fail(503, "taste_busy");

  // Counted BEFORE the call, so a failing upstream cannot be hammered for free. hard=false: there is no hard path here.
  await d.usage.reserveIp(ip, now, false);
  await d.usage.reserveGlobal(now, false);
  d.sessions.add(sessionKey, now);

  // Which try this is (1-based), decided here from the server's own counts, never by the browser.
  const turn = Math.min(TASTE_LIMITS.perSessionTurns, Math.max(done, usedBefore) + 1);
  const last = turn >= TASTE_LIMITS.perSessionTurns;

  // One automatic retry if the model returned nothing usable (the visitor never sees a blank-answer error for that).
  let reply: string | null = null;
  let scene: Record<string, unknown> | undefined;
  let acts: TasteActs = {};
  for (let attempt = 0; attempt < 2 && !reply; attempt++) {
    let up;
    try {
      up = await callAnthropic({
        fetchImpl: d.fetchImpl, apiKey: d.env.apiKey, model: TASTE_MODEL,
        system: tasteSystem(r.teacher), user: buildTasteUser(r, turn), maxTokens: TASTE_LIMITS.maxOutputTokens,
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
    const redirected = reply === TASTE_REDIRECT; // a moderated reply carries no picture, gesture or board
    scene = reply && !redirected ? extractScene(up.content) : undefined;
    acts = reply && !redirected ? extractActs(up.content, up.stopReason === "max_tokens") : {};
    if (last) delete acts.choices; // the last try ends with a tease, not a question: enforced here, not only in the prompt
    if (!reply) {
      // Types and counts only, never the visitor's words or the model's.
      const types = Array.isArray(up.content) ? up.content.slice(0, 6).map((b) => String((b as { type?: unknown })?.type ?? "?").slice(0, 16)).join(",") : "none";
      d.log("bad_model_output", { attempt: attempt + 1, blocks: types, stop: up.stopReason ?? "?", out: up.usage.output });
    }
  }
  if (!reply) return fail(502, "bad_model_output");
  const turnsLeft = Math.max(0, TASTE_LIMITS.perSessionTurns - Math.max(done, usedBefore) - 1);
  const body: TasteResponse = { reply, turnsLeft, ...(scene ? { scene } : {}), ...acts };
  return new Response(JSON.stringify(body), { status: 200, headers: { ...HEADERS, "set-cookie": makeTasteCookie(usedBefore + 1, secret, now, ckExp) } });
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
    const s = sanitizeSay(stripSceneLine((b as { text?: unknown }).text), TASTE_LIMITS.maxReplyChars);
    if (s && !looksLikeNarration(s)) parts.push(s);
    if (parts.length >= 2) break;
  }
  const joined = parts.join(" ");
  if (joined && unsafeForLanding(joined)) return TASTE_REDIRECT; // same moderation as the lessons: an unsafe line is never shown or spoken
  return cleanText(joined, TASTE_LIMITS.maxReplyChars);
}

const SCENE_RE = /SCENE:\s*(\{[^\n]*\})/;
/** Shown instead of an unsafe reply. The landing has no "lesson", so it says something that fits a first visit. */
export const TASTE_REDIRECT = "Let's ask something else. If something is worrying you, please talk to a grown-up you trust.";
/** Open-world questions: the lesson filter, minus harmless science and history phrases it would otherwise trip on. */
const BENIGN = /\bnaked[- ]eyes?\b|\bgunpowder\b|\bsexual (?:reproduction|organs?)\b|\btiti monkeys?\b/gi;
export const unsafeForLanding = (t: string) => unsafeOutput(t.replace(BENIGN, " "));

const MARKER_STRIP = /\b(SCENE|GESTURE|BOARD|CHOICES|TOPIC)\s*[:\uFF1A][^\n\r]*/gi;
/** ACT only at the start of a line ("let's act: ..." mid-sentence is speech, not a marker). */
const ACT_STRIP = /(^|\n)[ \t]*ACT\s*[:\uFF1A][^\n\r]*/gi;
const stripSceneLine = (t: unknown) => (typeof t === "string" ? t.replace(/[\u200b-\u200f\u2060\ufeff]/g, "").replace(MARKER_STRIP, "").replace(ACT_STRIP, "$1") : t);
const GESTURE_RE = /^GESTURE:[ \t]*([a-z_]{1,16})[ \t]*$/m;
const BOARD_RE = /BOARD:\s*([^\n]{1,120})$/m;
const ACT_RE = /^ACT:[ \t]*([a-z_]{1,16})[ \t]*$/m;
const CHOICES_RE = /^CHOICES:[ \t]*([^\n]{1,120})$/m;
const TOPIC_RE = /^TOPIC:[ \t]*([^\n]{1,80})$/m;

export type TasteActs = { gesture?: string; act?: string; board?: string; choices?: string[]; topic?: string };

/** A short model phrase passes only if the lesson sanitizer leaves it unchanged and it is not unsafe or a contact detail. */
const shortOk = (m: string, max: number) => {
  const c = sanitizeSay(m, max);
  return !!c && c === m && Array.from(m).length <= max && !unsafeOutput(c) && !looksLikeNarration(c) && !/@|\d{5,}|\d[\d\s-]{6,}\d/.test(c);
};

/**
 * Optional gesture (our fixed list only), whole-body action (the same validator as the lesson's `act` command, for
 * the landing classroom world only: an action that world does not allow, e.g. swim, is dropped) and chalkboard
 * phrase (sanitised like the reply; changed or empty = none).
 */
export function extractActs(blocks: unknown, truncated = false): TasteActs {
  const out: TasteActs = {};
  if (!Array.isArray(blocks) || truncated) return out; // a cut-off last line is never shown
  for (const b of blocks.slice(0, 8)) {
    if (!b || typeof b !== "object" || (b as { type?: unknown }).type !== "text") continue;
    const t = (b as { text?: unknown }).text;
    if (typeof t !== "string" || t.length >= 2000) continue;
    const g = GESTURE_RE.exec(t)?.[1];
    if (g && !out.gesture && (GESTURES as readonly string[]).includes(g)) out.gesture = g;
    const a = ACT_RE.exec(t)?.[1];
    if (a && !out.act) {
      const r = parseSceneCommand("act", { action: a }, contextFor(TASTE_WORLD));
      if (r.ok && r.command.name === "act") out.act = r.command.action;
    }
    const m = BOARD_RE.exec(t)?.[1]?.trim();
    if (m && !out.board) {
      const c = sanitizeSay(m, BOARD_MAX);
      if (c && c === m && Array.from(m).length <= BOARD_MAX && !unsafeOutput(c) && !looksLikeNarration(c) && !/@|\d{5,}|\d[\d\s-]{6,}\d/.test(c)) out.board = c;
    }
    const ch = CHOICES_RE.exec(t)?.[1];
    if (ch && !out.choices) {
      const parts = ch.split("|").map((x) => x.trim());
      // Too many, a blank, a duplicate, markup, a link or anything unsafe: no choices at all (never a partial set).
      if (parts.length <= 2 && parts.every((x) => shortOk(x, CHOICE_MAX)) && choicesOk(parts)) out.choices = parts;
    }
    const tp = TOPIC_RE.exec(t)?.[1]?.trim();
    if (tp && !out.topic && shortOk(tp, TOPIC_MAX) && topicOk(tp)) out.topic = tp;
  }
  return out;
}

/** The optional picture: one SCENE line, parsed as JSON and passed through parseFrame (own ids only). Anything else = no picture. */
export function extractScene(blocks: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(blocks)) return undefined;
  for (const b of blocks.slice(0, 8)) {
    if (!b || typeof b !== "object" || (b as { type?: unknown }).type !== "text") continue;
    const t = (b as { text?: unknown }).text;
    const m = typeof t === "string" && t.length < 2000 ? SCENE_RE.exec(t) : null;
    if (!m) continue;
    try {
      const f = parseFrame(JSON.parse(m[1]));
      if (f.ok) {
        const era = sanitizeSay(f.frame.era, 60); // same link/contact stripping as the reply; changed or empty = no picture
        if (era && era === f.frame.era) return frameToArgs(f.frame);
      }
    } catch { /* no picture */ }
  }
  return undefined;
}
