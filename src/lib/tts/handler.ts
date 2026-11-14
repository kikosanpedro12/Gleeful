import "server-only";
import { RateLimiter } from "@/lib/brain/server/limits";
import { TESTER_CODE_MIN, type BrainEnv } from "@/lib/brain/server/config";
import { TESTER_HEADER, testerOk, clientIp, readBody } from "@/lib/brain/server/handler";
import { crossOrigin } from "@/lib/http/request";
import { TTS_MAX_CHARS, isTtsVoice } from "./voices";

/**
 * Text-to-speech through Deepgram Aura-2. The key stays on the server. Closed by default: only a holder of the
 * private-test passcode (same one as /api/brain) can use it. Spend is braked three ways: per-address rate, a daily
 * character ceiling for the whole deployment (hard-capped here), and Deepgram's own prepaid credit (no card on file
 * during the free-credit period, so it cannot bill). Text is never logged.
 */
export const TTS_LIMITS = {
  perIpPerMinute: 20,
  /** Default and absolute ceiling of characters spoken per day, whole deployment (about 54k chars = 1 hour of speech). */
  dailyCharsDefault: 60_000,
  dailyCharsMax: 300_000,
  upstreamTimeoutMs: 10_000,
  maxBodyBytes: 2 * 1024,
  bodyReadTimeoutMs: 3_000,
  /** Refuse audio bigger than this from upstream (a 300-character line is well under 1 MB). */
  maxAudioBytes: 2 * 1024 * 1024,
} as const;

export interface TtsEnv { key: string | undefined; disabled: boolean; dailyChars: number }
export function readTtsEnv(env: Record<string, string | undefined> = process.env): TtsEnv {
  const n = Number.parseInt(env.TTS_DAILY_CHARS ?? "", 10);
  const flag = (env.TTS_DISABLED ?? "").trim().toLowerCase();
  return {
    key: env.DEEPGRAM_API_KEY?.trim() || undefined,
    disabled: flag === "1" || flag === "true" || flag === "yes" || (env.BRAIN_DISABLED ?? "").trim() === "1",
    dailyChars: Number.isFinite(n) && n > 0 ? Math.min(n, TTS_LIMITS.dailyCharsMax) : TTS_LIMITS.dailyCharsDefault,
  };
}

export interface TtsDeps {
  env: TtsEnv;
  brainEnv: BrainEnv;
  fetchImpl: typeof fetch;
  now: () => number;
  ipLimiter: RateLimiter;
  /** Characters spent today (UTC day) by the whole deployment. */
  spent: { day: string; chars: number };
}
export function makeTtsDeps(over: Partial<TtsDeps> & Pick<TtsDeps, "env" | "brainEnv">): TtsDeps {
  return { fetchImpl: fetch, now: () => Date.now(), ipLimiter: new RateLimiter(TTS_LIMITS.perIpPerMinute, 60_000), spent: { day: "", chars: 0 }, ...over };
}

const fail = (status: number, code: string, headers: Record<string, string> = {}) =>
  Response.json({ error: code }, { status, headers: { "cache-control": "no-store", ...headers } });

export async function handleTts(req: Request, d: TtsDeps): Promise<Response> {
  if (crossOrigin(req)) return fail(403, "forbidden_origin");
  if (d.env.disabled || !d.env.key) return fail(503, "tts_unconfigured");
  const { testerCode, testerMisconfigured } = d.brainEnv;
  if (!testerCode || testerMisconfigured || testerCode.length < TESTER_CODE_MIN) return fail(503, "tts_unconfigured"); // closed by default
  const now = d.now();
  const wait = d.ipLimiter.take(clientIp(req), now);
  if (wait > 0) return fail(429, "rate_limited", { "retry-after": String(wait) });
  if (!testerOk(testerCode, req.headers.get(TESTER_HEADER))) return fail(403, "tester_required");

  const body = await readBody(req, TTS_LIMITS.maxBodyBytes, TTS_LIMITS.bodyReadTimeoutMs);
  if (!body.ok) return fail(body.status, "bad_request");
  let text: unknown, voice: unknown;
  try { ({ text, voice } = JSON.parse(body.text) as { text?: unknown; voice?: unknown }); } catch { return fail(400, "bad_request"); }
  if (typeof text !== "string" || !isTtsVoice(voice)) return fail(400, "bad_request");
  text = text.replace(/\s+/g, " ").trim();
  if (!(text as string) || (text as string).length > TTS_MAX_CHARS) return fail(400, "bad_request");
  const say = text as string;

  const day = new Date(now).toISOString().slice(0, 10);
  if (d.spent.day !== day) d.spent = { day, chars: 0 };
  if (d.spent.chars + say.length > d.env.dailyChars) return fail(429, "daily_limit");
  const bucket = d.spent; // refunds go to THIS day's bucket even if UTC midnight passes during the call
  bucket.chars += say.length;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TTS_LIMITS.upstreamTimeoutMs);
  try {
    const r = await d.fetchImpl(`https://api.deepgram.com/v1/speak?model=${voice}&encoding=mp3`, {
      method: "POST",
      headers: { Authorization: `Token ${d.env.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: say }),
      signal: ctl.signal,
    });
    // Refunded only for a clean upstream refusal. A timeout, an exception or odd audio keeps the charge: the conservative choice for spend.
    if (!r.ok) { bucket.chars = Math.max(0, bucket.chars - say.length); return fail(502, "upstream_error"); }
    if (Number(r.headers.get("content-length") ?? 0) > TTS_LIMITS.maxAudioBytes) return fail(502, "upstream_error");
    const audio = await r.arrayBuffer();
    if (audio.byteLength === 0 || audio.byteLength > TTS_LIMITS.maxAudioBytes) return fail(502, "upstream_error");
    return new Response(audio, { status: 200, headers: { "content-type": "audio/mpeg", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch {
    return fail(502, "upstream_error");
  } finally {
    clearTimeout(timer);
  }
}

/** Capability check: booleans only, no secrets. */
export function ttsStatus(d: TtsDeps) {
  const { testerCode, testerMisconfigured } = d.brainEnv;
  return { configured: Boolean(d.env.key) && !d.env.disabled && Boolean(testerCode) && !testerMisconfigured };
}
