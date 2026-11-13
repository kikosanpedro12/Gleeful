import "server-only";
/**
 * POST /api/waitlist as a pure function of (Request, deps), so tests can run it
 * with a mocked Supabase. Writes one row to public.waitlist through the
 * Supabase Data API with the SECRET key (service_role), which never leaves the
 * server.
 *
 * Privacy: the email address is never logged, echoed back or put in a URL.
 * The only logged fields are event names and HTTP status codes. A repeat
 * sign-up looks exactly like a new one, so the form cannot be used to check
 * whether someone is on the list.
 */
import { clientIp, readBody } from "@/lib/brain/server/handler";
import { RateLimiter } from "@/lib/brain/server/limits";

export const WAITLIST_LIMITS = {
  maxBodyBytes: 2_048,
  bodyReadTimeoutMs: 3_000,
  perIpPerHour: 8,
  upstreamTimeoutMs: 6_000,
} as const;

export type WaitlistError = "unconfigured" | "forbidden_origin" | "unsupported_media" | "too_large" | "bad_request" | "invalid_email" | "consent_required" | "rate_limited" | "upstream";

export interface WaitlistEnv { url: string | null; secretKey: string | null }
export function readWaitlistEnv(env: NodeJS.ProcessEnv = process.env): WaitlistEnv {
  const raw = env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  let url: string | null = null;
  try {
    const u = new URL(raw);
    if (u.protocol === "https:" || u.hostname === "localhost" || u.hostname === "127.0.0.1") url = u.origin;
  } catch { url = null; }
  return { url, secretKey: env.SUPABASE_SECRET_KEY?.trim() || null };
}

export interface WaitlistDeps {
  env: WaitlistEnv;
  fetchImpl: typeof fetch;
  now: () => number;
  limiter: RateLimiter;
  log: (event: string, fields: Record<string, string | number>) => void;
}
export function makeWaitlistDeps(partial: Pick<WaitlistDeps, "env"> & Partial<WaitlistDeps>): WaitlistDeps {
  return {
    fetchImpl: (...a) => fetch(...a),
    now: () => Date.now(),
    limiter: new RateLimiter(WAITLIST_LIMITS.perIpPerHour, 3_600_000),
    log: (event, fields) => console.warn(`[waitlist] ${event}`, fields),
    ...partial,
  };
}

const HEADERS = { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-robots-tag": "noindex" } as const;
const reply = (status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });
const fail = (status: number, error: WaitlistError, extra: Record<string, string> = {}) => reply(status, { error }, extra);

/** Same rule as /api/brain: a browser on another site must not be able to post this form. */
export function crossOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  try { return new URL(origin).host !== host; } catch { return true; }
}

// Deliberately simple and strict; the database checks the same shape again.
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
export function normaliseEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const e = input.trim().toLowerCase();
  if (e.length < 6 || e.length > 254) return null;
  return EMAIL.test(e) ? e : null;
}

export async function handleWaitlist(req: Request, d: WaitlistDeps): Promise<Response> {
  if (crossOrigin(req)) return fail(403, "forbidden_origin");
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return fail(415, "unsupported_media");
  if (Number(req.headers.get("content-length") ?? 0) > WAITLIST_LIMITS.maxBodyBytes) return fail(413, "too_large");

  const wait = d.limiter.take(clientIp(req), d.now());
  if (wait) return fail(429, "rate_limited", { "retry-after": String(wait) });

  const raw = await readBody(req, WAITLIST_LIMITS.maxBodyBytes, WAITLIST_LIMITS.bodyReadTimeoutMs);
  if (!raw.ok) return raw.status === 413 ? fail(413, "too_large") : fail(400, "bad_request");
  let body: Record<string, unknown>;
  try {
    const j = JSON.parse(raw.text);
    if (!j || typeof j !== "object" || Array.isArray(j)) return fail(400, "bad_request");
    body = j as Record<string, unknown>;
  } catch { return fail(400, "bad_request"); }

  // Honeypot: a field real people never see. Bots that fill it get a normal-looking success.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    d.log("honeypot", { status: 200 });
    return reply(200, { ok: true });
  }
  const email = normaliseEmail(body.email);
  if (!email) return fail(400, "invalid_email");
  if (body.consent !== true) return fail(400, "consent_required");
  const source = body.source === "landing_footer" ? "landing_footer" : "landing";

  if (!d.env.url || !d.env.secretKey) return fail(503, "unconfigured");

  const headers: Record<string, string> = {
    apikey: d.env.secretKey,
    "content-type": "application/json",
    prefer: "resolution=ignore-duplicates,return=minimal",
  };
  // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys go in apikey only.
  if (d.env.secretKey.startsWith("eyJ")) headers.authorization = `Bearer ${d.env.secretKey}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), WAITLIST_LIMITS.upstreamTimeoutMs);
  try {
    const res = await d.fetchImpl(`${d.env.url}/rest/v1/waitlist?on_conflict=email`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, consent: true, source }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.status === 201 || res.status === 200 || res.status === 204 || res.status === 409) return reply(200, { ok: true });
    d.log("upstream_status", { status: res.status });
    return fail(502, "upstream");
  } catch {
    d.log("upstream_error", { status: 0 });
    return fail(502, "upstream");
  } finally {
    clearTimeout(timer);
  }
}
