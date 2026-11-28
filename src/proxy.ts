import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/refresh";
import { CAMPAIGN_COOKIE, CAMPAIGN_MAX_AGE, CAMPAIGN_PATHS, campaignFromRequest, cookieToSet } from "@/lib/events/campaign";

/**
 * Per-request Content Security Policy with a fresh nonce (Next.js "proxy",
 * formerly middleware). Scripts only run if they carry this request's nonce
 * or are loaded by one ('strict-dynamic'): an injected <script> cannot run.
 *
 * - No 'unsafe-inline' scripts; no 'unsafe-eval' in production (React needs it in dev).
 * - style-src-attr 'unsafe-inline': React renders style="" attributes; these cannot run code.
 * - connect-src: only our own origin, plus the Supabase project when configured.
 */
function supabaseOrigins(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return "";
    const ws = u.protocol === "https:" ? `wss://${u.host}` : `ws://${u.host}`;
    return ` ${u.origin} ${ws}`;
  } catch {
    return "";
  }
}

export function buildCsp(nonce: string, opts: { dev: boolean; https: boolean }) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${opts.dev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${supabaseOrigins()}${opts.dev ? " ws: wss:" : ""}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self'${supabaseOrigins().split(" ").filter((o) => o.startsWith("http")).map((o) => " " + o).join("")}`,
    "frame-ancestors 'none'",
    ...(opts.https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** Only these paths need a fresh session; every other page is public and skips the work. */
const AUTH_PATHS = /^\/(parent|sign-in|auth|admin|api\/brain|api\/checkout)(\/|$)/;

export async function proxy(request: NextRequest) {
  // Refresh first: it may update the request's cookies, and the headers below are copied from the request afterwards.
  const refreshed = AUTH_PATHS.test(request.nextUrl.pathname) ? await refreshSession(request) : null;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const https = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV === "development", https });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (refreshed) {
    for (const c of refreshed.cookies) response.cookies.set(c.name, c.value, c.options);
    for (const [k, v] of Object.entries(refreshed.headers)) response.headers.set(k, v);
  }
  setCampaignCookie(request, response, https);
  return response;
}

/**
 * First-party campaign memory (see src/lib/events/campaign.ts): on a landing visit that carries utm tags or comes from another
 * site, keep ONLY the three tags and the referrer host (re-validated, never a URL) for 30 days, so the sign-up count can say
 * where a family came from. httpOnly: no script can read it. Not set on the lesson app, parent area or API.
 */
function setCampaignCookie(request: NextRequest, response: NextResponse, https: boolean) {
  try {
    if (request.method !== "GET" || !CAMPAIGN_PATHS.includes(request.nextUrl.pathname)) return;
    const own = [request.nextUrl.hostname, request.headers.get("host")?.split(":")[0] ?? ""];
    try { if (process.env.NEXT_PUBLIC_SITE_URL) own.push(new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname); } catch { /* ignore a bad site url */ }
    const value = cookieToSet(campaignFromRequest(request.nextUrl.searchParams, request.headers.get("referer"), own.filter(Boolean)), request.cookies.get(CAMPAIGN_COOKIE)?.value);
    if (value) response.cookies.set(CAMPAIGN_COOKIE, value, { httpOnly: true, sameSite: "lax", secure: https || process.env.NODE_ENV === "production", maxAge: CAMPAIGN_MAX_AGE, path: "/" });
  } catch { /* measuring must never break a page */ }
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
