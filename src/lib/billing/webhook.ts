import "server-only";
import { mapEvent, verifySignature } from "./freemius";
import type { BillingStore } from "./store";
import type { PaymentsMode } from "./config";
import { readBody } from "@/lib/http/request";

export interface WebhookDeps { mode: PaymentsMode; secret: string; store: BillingStore; now: () => Date }

const MAX_BODY = 64 * 1024;
const H = { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" } as const;
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: H });

/**
 * Order matters, cheapest and safest first:
 *  1. Payments off or no secret configured: 503, nothing is read.
 *  2. Body size cap, read as bytes.
 *  3. Signature over the RAW body. A bad or missing signature is 401 and nothing else is looked at.
 *  4. Parse and map. An event we do not act on, or cannot read completely, is acknowledged (200) and changes nothing,
 *     so Freemius does not retry it forever and unknown input never grants access.
 *  5. Apply idempotently. A database failure is a 500 so Freemius retries; the event id makes the retry safe.
 * Nothing about the buyer is logged.
 */
export async function handleWebhook(req: Request, d: WebhookDeps): Promise<Response> {
  if (d.mode === "off" || d.secret.length < 16) return reply(503, { error: "payments_off" });
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return reply(413, { error: "too_large" });
  // Streamed with a deadline and a hard cap, so a lying Content-Length or a stalled sender cannot hold the connection or memory.
  const body = await readBody(req, MAX_BODY, 5_000);
  if (!body.ok) return body.status === 413 ? reply(413, { error: "too_large" }) : reply(400, { error: "bad_request" });
  const raw = body.text;
  if (!verifySignature(raw, req.headers.get("x-signature"), d.secret)) return reply(401, { error: "bad_signature" });
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return reply(400, { error: "bad_request" }); }
  const change = mapEvent(json);
  if (!change) {
    // Content-free: the event type (if it is a short, plain string) and nothing about the buyer. A paid event that lands
    // here means a field name or plan name did not match, which the founder needs to notice.
    const t = (json as { type?: unknown } | null)?.type;
    console.warn("[billing] event not acted on", typeof t === "string" && /^[a-z0-9_.]{1,60}$/.test(t) ? t : "unreadable");
    return reply(200, { ok: true, handled: "ignored" });
  }
  try {
    const result = await d.store.apply(change, d.now());
    return reply(200, { ok: true, handled: result });
  } catch {
    console.warn("[billing] webhook store error"); // no event body, no e-mail
    return reply(500, { error: "store_failed" });
  }
}
