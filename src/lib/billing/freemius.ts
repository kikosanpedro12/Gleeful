import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isPlanId, type PlanId, type SubStatus } from "./plans";

/**
 * Freemius webhook helpers. Freemius signs every request with `x-signature`, a hex HMAC-SHA256 of the RAW body
 * using the product secret key (source: Freemius events/webhooks docs and Hookdeck's guide, read 23 Nov 2026).
 *
 * UNVERIFIED: Freemius does not publish the JSON body of each event. `mapEvent` reads the fields we expect
 * (`type`, `id`, `objects.user.email`, `objects.license.plan_name`, ...) defensively and ignores anything it does not
 * understand. Capture a real sandbox event (Developer Dashboard > Webhooks > Events) and confirm the field names before
 * switching PAYMENTS_MODE to live. Nothing here may grant access from an event it cannot fully read.
 */

/** Constant-time check of the hex signature over the raw bytes. Never throws. */
export function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  const given = header.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  const want = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  return timingSafeEqual(want, Buffer.from(given, "hex"));
}

export interface BillingChange {
  eventId: string;
  type: string;
  email: string;
  plan: PlanId | null;
  status: SubStatus;
  /** ISO time or null when the event did not say. */
  periodEnd: string | null;
  /** When Freemius says the event happened (ISO), or null. Used to ignore stale, out-of-order events. UNVERIFIED field name: `created`. */
  eventAt: string | null;
  freemiusUserId: string | null;
  freemiusSubscriptionId: string | null;
}

const MAP: Readonly<Record<string, SubStatus>> = Object.freeze({
  "install.trial.started": "trialing",
  "subscription.created": "active",
  "subscription.renewal.completed": "active",
  "payment.created": "active",
  "subscription.renewal.failed": "past_due",
  "subscription.cancelled": "canceled",
  "license.cancelled": "canceled",
  "install.trial.cancelled": "canceled",
  "install.trial.expired": "canceled",
  "payment.refund": "refunded",
});

function str(v: unknown, max = 200): string | null {
  return typeof v === "string" && v.length > 0 && v.length <= max ? v : null;
}
function rec(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function isoOrNull(v: unknown): string | null {
  const s = str(v, 40);
  if (!s) return null;
  const t = Date.parse(s.includes("T") ? s : s.replace(" ", "T") + "Z");
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Returns null for any event we do not act on, or cannot read completely (fail closed: unknown never grants access). */
export function mapEvent(json: unknown): BillingChange | null {
  const e = rec(json);
  if (!e) return null;
  const type = str(e.type, 80);
  const eventId = str(String(e.id ?? ""), 80);
  if (!type || !eventId || !Object.hasOwn(MAP, type)) return null;
  const objects = rec(e.objects) ?? {};
  const user = rec(objects.user);
  const email = str(user?.email, 254)?.toLowerCase() ?? null;
  if (!email || !/^[\x21-\x7e]+@[\x21-\x7e]+\.[\x21-\x7e]+$/.test(email)) return null; // ASCII only: the database lower-cases with its own rules
  const license = rec(objects.license);
  const sub = rec(objects.subscription);
  // Accept "solo", "Solo", "Solo Plan", "family_monthly": the first word decides, and it must still be a known plan.
  const planName = str(license?.plan_name ?? sub?.plan_name, 40)?.toLowerCase().split(/[\s_-]+/)[0] ?? null;
  const plan = planName && isPlanId(planName) ? planName : null;
  const status = MAP[type];
  // A grant needs a known plan; a stop (cancel, refund, failed renewal) does not.
  if ((status === "trialing" || status === "active") && !plan) return null;
  const periodEnd = isoOrNull(license?.expiration ?? sub?.next_payment ?? license?.trial_ends);
  const idOf = (v: unknown) => (typeof v === "number" || typeof v === "string" ? str(String(v), 40) : null);
  return {
    eventId, type, email, plan, status, periodEnd, eventAt: isoOrNull(e.created),
    freemiusUserId: idOf(user?.id),
    freemiusSubscriptionId: idOf(sub?.id),
  };
}
