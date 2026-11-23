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
  const windows = [];
  for (const w of WINDOWS) {
    const since = new Date(now.getTime() - w.days * 86_400_000).toISOString();
    const r = (await sql<Record<string, number>[]>`
      select
        count(*) filter (where status = 'trialing' and prev_status is null)::int                                   as trials_started,
        count(*) filter (where status = 'canceled' and prev_status = 'trialing')::int                              as cancelled_trials,
        count(*) filter (where status = 'active'   and prev_status = 'trialing')::int                              as trial_to_paid,
        count(*) filter (where status = 'active'   and prev_status is null)::int                                   as direct_paid,
        count(*) filter (where status = 'canceled' and prev_status in ('active', 'past_due'))::int                 as paid_cancelled,
        count(*) filter (where status = 'refunded')::int                                                           as refunds,
        count(*) filter (where status = 'past_due')::int                                                           as failed_payments
      from public.billing_events where applied and received_at >= ${since}`)[0];
    windows.push({ label: w.label, trialsStarted: r.trials_started, cancelledTrials: r.cancelled_trials, trialToPaid: r.trial_to_paid, directPaid: r.direct_paid, paidCancelled: r.paid_cancelled, refunds: r.refunds, failedPayments: r.failed_payments });
  }
  return { current, windows, estMonthlyUsd: estimateMonthlyUsd(current), generatedAt: now.toISOString() };
}
