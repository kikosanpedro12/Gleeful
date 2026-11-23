import "server-only";
import { RateLimiter } from "@/lib/brain/server/limits";
import { clientIp, crossOrigin, readBody } from "@/lib/http/request";
import { isHoneypot, parseFeedback, type FeedbackInput } from "./validate";

export interface FeedbackDeps {
  configured: () => boolean;
  /** Resolves false when the database-side cap refused the message. */
  save: (f: FeedbackInput) => Promise<boolean>;
  limiter: RateLimiter;
  now: () => number;
}
export const makeFeedbackLimiter = () => new RateLimiter(5, 10 * 60_000); // 5 messages per address per 10 minutes (a brake: per warm instance)

const H = { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" } as const;
const reply = (status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...H, ...extra } });

/** POST /api/feedback. Anyone may send one; the message is never logged and never echoed back. */
export async function handleFeedback(req: Request, d: FeedbackDeps): Promise<Response> {
  if (crossOrigin(req)) return reply(403, { error: "cross_origin" });
  if (!d.configured()) return reply(503, { error: "unavailable" });
  const wait = d.limiter.take(clientIp(req), d.now());
  if (wait > 0) return reply(429, { error: "rate_limited" }, { "retry-after": String(wait) });
  const body = await readBody(req, 8 * 1024, 5_000);
  if (!body.ok) return reply(body.status, { error: body.status === 413 ? "too_large" : "bad_request" });
  let json: unknown;
  try { json = JSON.parse(body.text); } catch { return reply(400, { error: "bad_request" }); }
  if (isHoneypot(json)) return reply(200, { ok: true });
  const f = parseFeedback(json);
  if (!f) return reply(400, { error: "bad_request" });
  let saved: boolean;
  try { saved = await d.save(f); } catch { return reply(500, { error: "save_failed" }); }
  if (!saved) return reply(429, { error: "busy" }, { "retry-after": "3600" });
  return reply(200, { ok: true });
}
