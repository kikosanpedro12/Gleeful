/**
 * The first-party campaign cookie: which link brought a visitor (three utm tags and a referrer host), kept 30 days so the
 * sign-up event can say where the family came from. Pure and hostile-input safe: every part is re-validated on the way in
 * (proxy) and again on the way out (sign-in callback). Never holds an e-mail, an id or a full URL.
 */
import { sanitizeHost, sanitizeTag } from "./codes";

export const CAMPAIGN_COOKIE = "gl_src";
export const CAMPAIGN_MAX_AGE = 30 * 24 * 60 * 60;
export interface Campaign { source: string | null; medium: string | null; campaign: string | null; refHost: string | null }
const EMPTY: Campaign = { source: null, medium: null, campaign: null, refHost: null };
/** Pages where a campaign link can land. Everything else (the lesson app, parent area, API) never sets the cookie. */
export const CAMPAIGN_PATHS: readonly string[] = ["/", "/pricing", "/faq"];

export const hasCampaign = (c: Campaign) => Boolean(c.source || c.medium || c.campaign || c.refHost);

/** "source~medium~campaign~host". '~' cannot appear in a valid part, so it is a safe separator and the cookie needs no escaping. */
export function encodeCampaign(c: Campaign): string {
  return [c.source, c.medium, c.campaign, c.refHost].map((p) => p ?? "").join("~");
}
export function decodeCampaign(raw: unknown): Campaign {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 260) return EMPTY;
  const p = raw.split("~");
  if (p.length !== 4) return EMPTY;
  return { source: sanitizeTag(p[0]), medium: sanitizeTag(p[1]), campaign: sanitizeTag(p[2]), refHost: sanitizeHost(p[3]) };
}

/** Reads the tags from a landing URL's query string and an external referrer. `ownHosts` are our own host names (not a referrer). */
export function campaignFromRequest(params: URLSearchParams, referer: string | null, ownHosts: readonly string[]): Campaign {
  const c: Campaign = { source: sanitizeTag(params.get("utm_source")), medium: sanitizeTag(params.get("utm_medium")), campaign: sanitizeTag(params.get("utm_campaign")), refHost: null };
  if (referer && referer.length <= 2048) {
    try {
      const u = new URL(referer);
      const host = u.protocol === "https:" || u.protocol === "http:" ? sanitizeHost(u.hostname) : null;
      const own = ownHosts.map((h) => h.toLowerCase().replace(/^www\./, ""));
      if (host && !own.includes(host)) c.refHost = host;
    } catch { /* not a URL: no referrer */ }
  }
  return c;
}

/**
 * What the proxy should do on a landing visit: a cookie value to set, or null to leave things alone.
 * A visit with utm tags replaces the cookie (the newest explicit campaign wins); a bare external referrer only fills an empty cookie.
 */
export function cookieToSet(fresh: Campaign, existingRaw: string | undefined): string | null {
  if (!hasCampaign(fresh)) return null;
  const hasTags = Boolean(fresh.source || fresh.medium || fresh.campaign);
  if (!hasTags && hasCampaign(decodeCampaign(existingRaw))) return null;
  return encodeCampaign(fresh);
}
