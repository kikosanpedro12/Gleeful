import "server-only";
/**
 * POST /auth/sign-in, as a pure function of (Request, deps) so tests can run it with a fake Supabase.
 *
 *   mode "password"  email + password sign-in
 *   mode "magic"     emails a one-time sign-in link (creates the account on first use)
 *   mode "signup"    email + password sign-up (the confirmation email finishes it)
 *
 * Rules:
 *  - No account enumeration. The magic-link and sign-up answers are identical whether or not the
 *    address is already registered; a failed password sign-in never says which half was wrong.
 *  - Brakes: per client address AND per email address (so one person cannot be mail-bombed with links).
 *    HONEST STATUS: in-memory per warm server instance (a brake, not a ceiling); Supabase Auth's own
 *    rate limits and CAPTCHA are the ceiling.
 *  - Same-origin only (CSRF), small JSON body only, redirect target always from safeNext().
 *  - Nothing personal is logged: no email, no password, no address.
 */
import { createHash } from "node:crypto";
import { RateLimiter } from "@/lib/brain/server/limits";
import { clientIp, crossOrigin, readBody } from "@/lib/http/request";
import { safeNext } from "./safeNext";
import { cleanEmail, isMode, passwordProblem } from "./validate";

export interface AuthPort {
  /** true = signed in (the session cookie has been set). */
  signInWithPassword(email: string, password: string): Promise<boolean>;
  signInWithOtp(email: string, redirectTo: string): Promise<void>;
  signUp(email: string, password: string, redirectTo: string): Promise<void>;
}

export interface SignInDeps {
  /** null = parent accounts are not configured on this deployment. */
  port: AuthPort | null;
  /** Origin used to build the link in the email, e.g. https://gleeful.app */
  siteUrl: string;
  ipLimiter: RateLimiter;
  emailLimiter: RateLimiter;
  now: () => number;
  log: (event: string, fields: Record<string, string | number>) => void;
}

export const SIGNIN_LIMITS = { perIp: 12, perEmail: 5, windowMs: 10 * 60_000, maxBody: 2048, bodyTimeoutMs: 4000 } as const;

export function makeSignInDeps(partial: Pick<SignInDeps, "port" | "siteUrl"> & Partial<SignInDeps>): SignInDeps {
  return {
    ipLimiter: new RateLimiter(SIGNIN_LIMITS.perIp, SIGNIN_LIMITS.windowMs),
    emailLimiter: new RateLimiter(SIGNIN_LIMITS.perEmail, SIGNIN_LIMITS.windowMs),
    now: () => Date.now(),
    log: (event, fields) => console.warn(`[auth] ${event}`, fields),
    ...partial,
  };
}

export const MESSAGES = {
  unavailable: "Parent accounts are not switched on in this version yet. The classroom demo works without one.",
  magic: "If that address can receive email, a sign-in link is on its way. It works once and expires soon. Open it in this same browser.",
  signup: "Check your email to finish creating your account. If you already have an account, sign in instead.",
  badLogin: "That email and password don't match, or the email hasn't been confirmed yet.",
  badEmail: "Enter a valid email address.",
  badRequest: "Something was wrong with that request. Please try again.",
  slow: "Too many attempts. Please wait a few minutes and try again.",
} as const;

const HEADERS = { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" } as const;
const reply = (status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });

/** Stable, non-reversible key for the per-email brake (the address itself is never stored in the table). */
const emailKey = (email: string) => createHash("sha256").update(email).digest("hex").slice(0, 32);

export async function handleSignIn(req: Request, d: SignInDeps): Promise<Response> {
  if (!d.port) return reply(503, { ok: false, message: MESSAGES.unavailable });
  if (crossOrigin(req)) return reply(403, { ok: false, message: MESSAGES.badRequest });
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return reply(415, { ok: false, message: MESSAGES.badRequest });

  const now = d.now();
  const wait = d.ipLimiter.take(clientIp(req), now);
  if (wait) return reply(429, { ok: false, message: MESSAGES.slow }, { "retry-after": String(wait) });

  const raw = await readBody(req, SIGNIN_LIMITS.maxBody, SIGNIN_LIMITS.bodyTimeoutMs);
  if (!raw.ok) return reply(raw.status === 413 ? 413 : 400, { ok: false, message: MESSAGES.badRequest });
  let body: Record<string, unknown>;
  try {
    const j: unknown = JSON.parse(raw.text);
    if (!j || typeof j !== "object" || Array.isArray(j)) return reply(400, { ok: false, message: MESSAGES.badRequest });
    body = j as Record<string, unknown>;
  } catch {
    return reply(400, { ok: false, message: MESSAGES.badRequest });
  }

  if (!isMode(body.mode)) return reply(400, { ok: false, message: MESSAGES.badRequest });
  const email = cleanEmail(body.email);
  if (!email) return reply(400, { ok: false, message: MESSAGES.badEmail });
  const next = safeNext(body.next);

  const eWait = d.emailLimiter.take(emailKey(email), now);
  if (eWait) return reply(429, { ok: false, message: MESSAGES.slow }, { "retry-after": String(eWait) });

  const redirectTo = `${d.siteUrl.replace(/\/+$/, "")}/auth/callback?next=${encodeURIComponent(next)}`;
  try {
    if (body.mode === "magic") {
      await d.port.signInWithOtp(email, redirectTo);
      return reply(200, { ok: true, message: MESSAGES.magic });
    }
    const problem = passwordProblem(body.password);
    if (body.mode === "signup") {
      if (problem) return reply(400, { ok: false, message: problem });
      await d.port.signUp(email, body.password as string, redirectTo);
      return reply(200, { ok: true, message: MESSAGES.signup });
    }
    // password sign-in: do not reveal password rules here (an old account may predate them), just try.
    if (typeof body.password !== "string" || body.password.length === 0 || body.password.length > 200) return reply(400, { ok: false, message: MESSAGES.badLogin });
    const ok = await d.port.signInWithPassword(email, body.password);
    return ok ? reply(200, { ok: true, next }) : reply(401, { ok: false, message: MESSAGES.badLogin });
  } catch {
    d.log("signin_error", { mode: String(body.mode) });
    // Same wording as a normal "no": a provider error must not become a way to tell accounts apart.
    return body.mode === "password" ? reply(401, { ok: false, message: MESSAGES.badLogin }) : reply(200, { ok: true, message: body.mode === "magic" ? MESSAGES.magic : MESSAGES.signup });
  }
}
