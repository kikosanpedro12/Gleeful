import "server-only";
import { PLANS, type PlanId } from "./plans";
import { db, billingConfigured } from "./store";

/** Raw counts straight from the database; shaped for /admin. No e-mail, no id, nothing about any one person. */
export interface BillingStats {
  /** People by current status and plan, right now. */
  current: { plan: PlanId; status: string; count: number }[];
  /** Events that actually changed something, counted per window (people can appear once per event). */
  windows: { label: string; trialsStarted: number; cancelledTrials: number; trialToPaid: number; directPaid: number; paidCancelled: number; refunds: number; failedPayments: number }[];
  /** ESTIMATE: active people x list price. Before fees, tax and refunds. */
  estMonthlyUsd: number;
  generatedAt: string;
}

export const WINDOWS = [{ label: "Last 7 days", days: 7 }, { label: "Last 30 days", days: 30 }, { label: "All time", days: 36500 }] as const;

export function estimateMonthlyUsd(current: { plan: PlanId; status: string; count: number }[]): number {
  return current.filter((r) => r.status === "active").reduce((sum, r) => sum + r.count * PLANS[r.plan].priceUsd, 0);
}

export async function loadBillingStats(now: Date = new Date()): Promise<BillingStats | null> {
  if (!billingConfigured()) return null;
  const sql = db();
  const cur = await sql<{ plan: string; status: string; n: number }[]>`select plan, status, count(*)::int as n from public.subscriptions group by plan, status order by plan, status`;
  const current = cur.filter((r) => r.plan === "solo" || r.plan === "family").map((r) => ({ plan: r.plan as PlanId, status: r.status, count: r.n }));
  // One round trip for all three windows (each trip to the database costs time on a serverless function).
  const labels = WINDOWS.map((w) => w.label);
  const sinces = WINDOWS.map((w) => new Date(now.getTime() - w.days * 86_400_000).toISOString());
  const rows = await sql<Record<string, number | string>[]>`
    select w.label,
      count(e.event_id) filter (where e.status = 'trialing' and e.prev_status is null)::int                       as trials_started,
      count(e.event_id) filter (where e.status = 'canceled' and e.prev_status = 'trialing')::int                  as cancelled_trials,
      count(e.event_id) filter (where e.status = 'active'   and e.prev_status = 'trialing')::int                  as trial_to_paid,
      count(e.event_id) filter (where e.status = 'active'   and e.prev_status is null)::int                       as direct_paid,
      count(e.event_id) filter (where e.status = 'canceled' and e.prev_status in ('active', 'past_due'))::int     as paid_cancelled,
      count(e.event_id) filter (where e.status = 'refunded')::int                                                 as refunds,
      count(e.event_id) filter (where e.status = 'past_due')::int                                                 as failed_payments
    from (values (${labels[0]}::text, ${sinces[0]}::timestamptz), (${labels[1]}::text, ${sinces[1]}::timestamptz), (${labels[2]}::text, ${sinces[2]}::timestamptz)) as w(label, since)
    left join public.billing_events e on e.applied and e.received_at >= w.since
    group by w.label`;
  const windows = labels.map((label) => {
    const r = rows.find((x) => x.label === label) ?? {};
    const n = (k: string) => Number(r[k] ?? 0);
    return { label, trialsStarted: n("trials_started"), cancelledTrials: n("cancelled_trials"), trialToPaid: n("trial_to_paid"), directPaid: n("direct_paid"), paidCancelled: n("paid_cancelled"), refunds: n("refunds"), failedPayments: n("failed_payments") };
  });
  return { current, windows, estMonthlyUsd: estimateMonthlyUsd(current), generatedAt: now.toISOString() };
}
