import "server-only";
import { RateLimiter } from "@/lib/brain/server/limits";
import { TESTER_CODE_MIN, type BrainEnv } from "@/lib/brain/server/config";
import { TESTER_HEADER, testerPrincipal, hasTesterAccess, clientIp, readBody } from "@/lib/brain/server/handler";
import { crossOrigin } from "@/lib/http/request";
import { ELEVEN_MAX_CHARS, ELEVEN_RATE_HEADER, ELEVEN_SAMPLE_RATE, ELEVEN_TEACHERS, isElevenTeacher, type ElevenTeacher } from "./elevenVoices";

/**
 * Live speech through ElevenLabs. The key stays on the server and goes only to api.elevenlabs.io. Closed by default:
 * only a holder of the private-test passcode (same one as /api/brain) can use it, and only when a key is set. Spend is
 * braked three ways: per-address rate, a daily character ceiling for the whole deployment (hard-capped here), and the
 * credit cap set on the ElevenLabs key itself (the real ceiling). The audio is streamed straight through so the first
 * sound can play before the line is finished. Text is never logged.
 */
export const ELEVEN_LIMITS = {
  perIpPerMinute: 20,
  /** Default and absolute ceiling of characters spoken per day, whole deployment. Matches the 30k credit cap on the key. */
  dailyCharsDefault: 30_000,
  dailyCharsMax: 100_000,
  /** Per tester (master code counts as one tester, each invite as its own). */
  testerDailyCharsDefault: 6_000,
  testerDailyCharsMax: 20_000,
  /** Bound on distinct tester buckets kept in memory (invites are capped at 50). */
  maxTesters: 100,
  /** Time to get the response headers from ElevenLabs. */
  headerTimeoutMs: 10_000,
  /** Whole call, including the streamed audio. */
  totalTimeoutMs: 18_000,
  maxBodyBytes: 2 * 1024,
  bodyReadTimeoutMs: 3_000,
  /** A 300-character line is about 20 s = 1 MB of 24 kHz PCM; refuse to forward more than this. */
  maxAudioBytes: 3 * 1024 * 1024,
} as const;

/**
 * STAND-IN voices (ElevenLabs premade "Will" and "Jessica") until Leo and Mia are designed and saved. Voice ids are not
 * secrets. Override per teacher with ELEVEN_VOICE_LEO / ELEVEN_VOICE_MIA (validated: 20 letters or digits).
 */
export const ELEVEN_DEFAULT_VOICES: Record<ElevenTeacher, string> = {
  leo: "bIHbv24MWmeRgasZH58o",
  mia: "cgSgspJ2msm6clMCkdW9",
};
export const ELEVEN_MODELS = ["eleven_v4_turbo", "eleven_v4", "eleven_flash_v2_5"] as const;
const VOICE_ID = /^[A-Za-z0-9]{20}$/;

export interface ElevenEnv { key: string | undefined; disabled: boolean; dailyChars: number; testerDailyChars: number; model: string; voices: Record<ElevenTeacher, string> }
export function readElevenEnv(env: Record<string, string | undefined> = process.env): ElevenEnv {
  const n = Number.parseInt(env.ELEVEN_DAILY_CHARS ?? "", 10);
  const flag = (env.TTS_DISABLED ?? "").trim().toLowerCase();
  const tn = Number.parseInt(env.ELEVEN_TESTER_DAILY_CHARS ?? "", 10);
  const model = (env.ELEVEN_MODEL ?? "").trim();
  const pick = (teacher: ElevenTeacher) => {
    const v = (env[`ELEVEN_VOICE_${teacher.toUpperCase()}`] ?? "").trim();
    return VOICE_ID.test(v) ? v : ELEVEN_DEFAULT_VOICES[teacher];
  };
  return {
    key: env.ELEVENLABS_API_KEY?.trim() || undefined,
    disabled: flag === "1" || flag === "true" || flag === "yes" || (env.BRAIN_DISABLED ?? "").trim() === "1",
    dailyChars: Number.isFinite(n) && n > 0 ? Math.min(n, ELEVEN_LIMITS.dailyCharsMax) : ELEVEN_LIMITS.dailyCharsDefault,
    testerDailyChars: Number.isFinite(tn) && tn > 0 ? Math.min(tn, ELEVEN_LIMITS.testerDailyCharsMax) : ELEVEN_LIMITS.testerDailyCharsDefault,
    model: (ELEVEN_MODELS as readonly string[]).includes(model) ? model : ELEVEN_MODELS[0],
    voices: { leo: pick("leo"), mia: pick("mia") },
  };
}

export interface ElevenDeps {
  env: ElevenEnv;
  brainEnv: BrainEnv;
  fetchImpl: typeof fetch;
  now: () => number;
  ipLimiter: RateLimiter;
  /** Characters spent today (UTC day) by the whole deployment. */
  spent: { day: string; chars: number };
  /** Characters spent today by each tester principal ("tester" or "tester:<name>"). */
  perTester: Map<string, { day: string; chars: number }>;
}
export function makeElevenDeps(over: Partial<ElevenDeps> & Pick<ElevenDeps, "env" | "brainEnv">): ElevenDeps {
  return { fetchImpl: fetch, now: () => Date.now(), ipLimiter: new RateLimiter(ELEVEN_LIMITS.perIpPerMinute, 60_000), spent: { day: "", chars: 0 }, perTester: new Map(), ...over };
}

const fail = (status: number, code: string, headers: Record<string, string> = {}) =>
  Response.json({ error: code }, { status, headers: { "cache-control": "no-store", ...headers } });

/** Shared gate: origin, kill switch, key, a passcode set up, rate limit, passcode. Returns a refusal, or who the tester is. */
function gate(req: Request, d: ElevenDeps): Response | { principal: string } {
  if (crossOrigin(req)) return fail(403, "forbidden_origin");
  if (d.env.disabled || !d.env.key) return fail(503, "voice_unconfigured");
  const { testerCode, testerMisconfigured } = d.brainEnv;
  if (!hasTesterAccess(d.brainEnv) || testerMisconfigured || (testerCode && testerCode.length < TESTER_CODE_MIN)) return fail(503, "voice_unconfigured"); // closed by default
  const wait = d.ipLimiter.take(clientIp(req), d.now());
  if (wait > 0) return fail(429, "rate_limited", { "retry-after": String(wait) });
  const principal = testerPrincipal(d.brainEnv, req.headers.get(TESTER_HEADER));
  if (!principal) return fail(403, "tester_required");
  return { principal };
}

export async function handleVoice(req: Request, d: ElevenDeps): Promise<Response> {
  const g = gate(req, d);
  if (g instanceof Response) return g;
  const now = d.now();

  const body = await readBody(req, ELEVEN_LIMITS.maxBodyBytes, ELEVEN_LIMITS.bodyReadTimeoutMs);
  if (!body.ok) return fail(body.status, "bad_request");
  let text: unknown, teacher: unknown;
  try { ({ text, teacher } = JSON.parse(body.text) as { text?: unknown; teacher?: unknown }); } catch { return fail(400, "bad_request"); }
  if (typeof text !== "string" || !isElevenTeacher(teacher)) return fail(400, "bad_request");
  // eslint-disable-next-line no-control-regex
  const say = text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!say || say.length > ELEVEN_MAX_CHARS) return fail(400, "bad_request");

  const day = new Date(now).toISOString().slice(0, 10);
  if (d.spent.day !== day) d.spent = { day, chars: 0 };
  // Per-tester ceiling first (so one tester cannot use the whole site's budget), then the site ceiling.
  let mine = d.perTester.get(g.principal);
  if (!mine) {
    if (d.perTester.size >= ELEVEN_LIMITS.maxTesters) return fail(503, "global_limit"); // fail closed; never evict a live bucket
    mine = { day, chars: 0 };
    d.perTester.set(g.principal, mine);
  }
  if (mine.day !== day) { mine.day = day; mine.chars = 0; }
  if (mine.chars + say.length > d.env.testerDailyChars) return fail(429, "tester_daily_limit");
  if (d.spent.chars + say.length > d.env.dailyChars) return fail(429, "daily_limit");
  const bucket = d.spent; // refunds go to THIS day's bucket even if UTC midnight passes during the call
  bucket.chars += say.length;
  mine.chars += say.length;
  const refund = () => { bucket.chars = Math.max(0, bucket.chars - say.length); mine!.chars = Math.max(0, mine!.chars - say.length); };

  const ctl = new AbortController();
  const total = setTimeout(() => ctl.abort(), ELEVEN_LIMITS.totalTimeoutMs);
  const headerTimer = setTimeout(() => ctl.abort(), ELEVEN_LIMITS.headerTimeoutMs);
  const done = () => { clearTimeout(headerTimer); clearTimeout(total); };
  try {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${d.env.voices[teacher]}/stream?output_format=pcm_${ELEVEN_SAMPLE_RATE}`;
    const r = await d.fetchImpl(url, {
      method: "POST",
      headers: { "xi-api-key": d.env.key as string, "content-type": "application/json" },
      body: JSON.stringify({ text: say, model_id: d.env.model }),
      signal: ctl.signal,
    });
    clearTimeout(headerTimer);
    // Refunded only for a clean upstream refusal. A timeout, an exception or odd audio keeps the charge: the conservative choice for spend.
    if (!r.ok || !r.body) { refund(); done(); return fail(502, "upstream_error"); }
    if (Number(r.headers.get("content-length") ?? 0) > ELEVEN_LIMITS.maxAudioBytes) { done(); ctl.abort(); return fail(502, "upstream_error"); }

    let seen = 0;
    const limited = r.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, c) {
        seen += chunk.byteLength;
        if (seen > ELEVEN_LIMITS.maxAudioBytes) { done(); ctl.abort(); c.error(new Error("audio_too_long")); return; }
        c.enqueue(chunk);
      },
      flush() { done(); },
    }));
    return new Response(limited, {
      status: 200,
      headers: { "content-type": "application/octet-stream", [ELEVEN_RATE_HEADER]: String(ELEVEN_SAMPLE_RATE), "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch {
    done();
    return fail(502, "upstream_error");
  }
}

/**
 * Capability check: booleans only, no secrets. With ?probe=1 AND the passcode it also asks ElevenLabs (a free account
 * lookup, no speech) whether the key works. UNVERIFIED: this needs the key to have user-read access; a key limited to
 * Text to Speech may answer 401, so keyValid:false does not by itself prove the key is bad, and answers with a boolean and an HTTP status only.
 */
export async function voiceStatus(req: Request, d: ElevenDeps) {
  const { testerMisconfigured } = d.brainEnv;
  const configured = Boolean(d.env.key) && !d.env.disabled && hasTesterAccess(d.brainEnv) && !testerMisconfigured;
  const base = { configured, teachers: [...ELEVEN_TEACHERS], model: d.env.model, standInVoices: ELEVEN_TEACHERS.every((t) => d.env.voices[t] === ELEVEN_DEFAULT_VOICES[t]) };
  if (!configured || new URL(req.url).searchParams.get("probe") !== "1") return { status: 200, body: base };
  const g = gate(req, d);
  if (g instanceof Response) return { status: g.status, body: { configured } };
  try {
    const r = await d.fetchImpl("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": d.env.key as string }, signal: AbortSignal.timeout(ELEVEN_LIMITS.headerTimeoutMs) });
    return { status: 200, body: { ...base, keyValid: r.ok, upstreamStatus: r.status } };
  } catch {
    return { status: 200, body: { ...base, keyValid: false, upstreamStatus: 0 } };
  }
}
