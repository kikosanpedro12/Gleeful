import { Analytics } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics (cookieless: no cookie, no local storage, no ad network, no cross-site tracking; page views and
 * visitor counts only). Rendered ONLY by the public marketing layout and the sign-in layout, never in the lesson app,
 * the parent area, /admin or /feedback. The script is served from our own origin (/_vercel/insights/*), so the CSP
 * needs no new origin; only on Vercel in production (`VERCEL=1`): in development the script would come from a CDN the CSP does not allow, and anywhere else /_vercel/insights/* does not exist (a 404 and a console error).
 */
export function PublicAnalytics() {
  return process.env.NODE_ENV === "production" && process.env.VERCEL === "1" ? <Analytics /> : null;
}
