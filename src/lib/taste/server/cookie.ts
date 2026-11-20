import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { TASTE_COOKIE } from "../protocol";

/**
 * One signed, httpOnly cookie counts how many free tries this browser has used, so a page refresh does not reset it.
 * HONEST LIMIT: clearing cookies or switching browser gives a new count. The per-address and global daily caps and the
 * Anthropic spend limit still bound the cost. A missing, forged or damaged cookie is a new visitor (0 used); forging gains nothing over omitting it, and
 * the per-address and global caps hold either way.
 */
export const TASTE_COOKIE_DAYS = 30;
const MAX_USED = 50;

export interface TasteCookie { used: number; exp: number }
const sign = (secret: string, payload: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function cookieSecret(env: Record<string, string | undefined>): string | null {
  const s = env.TASTE_COOKIE_SECRET?.trim() || env.ANTHROPIC_API_KEY?.trim();
  return s ? `taste-cookie-v1:${s}` : null;
}

export function readCookieHeader(header: string | null, name = TASTE_COOKIE): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** null = no cookie (new visitor); "bad" = present but invalid or expired-forged; else the verified state. */
export function verifyTasteCookie(raw: string | null, secret: string, now: number): TasteCookie | null | "bad" {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1 || raw.length > 120) return "bad";
  const payload = raw.slice(0, dot), mac = raw.slice(dot + 1);
  const want = Buffer.from(sign(secret, payload)), got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return "bad";
  const m = /^(\d{1,2})\.(\d{10,13})$/.exec(payload);
  if (!m) return "bad";
  const used = Number(m[1]), exp = Number(m[2]);
  if (used > MAX_USED) return "bad";
  if (exp < now) return null; // expired: a fresh window
  return { used, exp };
}

export function makeTasteCookie(used: number, secret: string, now: number, exp?: number): string {
  const e = exp ?? now + TASTE_COOKIE_DAYS * 86_400_000;
  const payload = `${Math.min(used, MAX_USED)}.${e}`;
  const maxAge = Math.max(1, Math.floor((e - now) / 1000));
  return `${TASTE_COOKIE}=${payload}.${sign(secret, payload)}; Max-Age=${maxAge}; Path=/api/taste; HttpOnly; Secure; SameSite=Lax`;
}
