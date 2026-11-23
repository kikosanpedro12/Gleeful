import type { Dashboard } from "@/lib/billing/dashboard";
import type { FeedbackRow } from "@/lib/feedback/store";

/** SAMPLE data for tests and screenshots only. Never imported by src/. */
export function sampleDashboard(days: 7 | 30 | 90 = 30): Dashboard {
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(2026, 10, 24) - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return { date: d, trialsStarted: (i * 7) % 5, paid: (i * 3) % 4 === 0 ? 1 : 0, cancelled: i % 6 === 0 ? 1 : 0, refunds: i % 17 === 0 ? 1 : 0, failed: i % 9 === 0 ? 1 : 0 };
  });
  const sum = (k: "trialsStarted" | "paid" | "cancelled" | "refunds" | "failed") => series.reduce((n, p) => n + p[k], 0);
  return {
    days, series,
    totals: { trialsStarted: sum("trialsStarted"), paid: sum("paid"), cancelled: sum("cancelled"), refunds: sum("refunds"), failed: sum("failed") },
    previous: { trialsStarted: sum("trialsStarted") + 3, paid: Math.max(0, sum("paid") - 2), cancelled: sum("cancelled"), refunds: 0, failed: 1 },
    funnel: { trialsStarted: 41, trialToPaid: 12 },
    stats: {
      current: [{ plan: "solo", status: "active", count: 9 }, { plan: "family", status: "active", count: 3 }, { plan: "solo", status: "trialing", count: 7 }, { plan: "solo", status: "canceled", count: 4 }, { plan: "family", status: "past_due", count: 1 }],
      windows: [{ label: "Last 7 days", trialsStarted: 6, cancelledTrials: 1, trialToPaid: 2, directPaid: 0, paidCancelled: 1, refunds: 0, failedPayments: 1 }, { label: "Last 30 days", trialsStarted: 41, cancelledTrials: 8, trialToPaid: 12, directPaid: 1, paidCancelled: 3, refunds: 1, failedPayments: 2 }, { label: "All time", trialsStarted: 60, cancelledTrials: 10, trialToPaid: 17, directPaid: 2, paidCancelled: 5, refunds: 1, failedPayments: 3 }],
      estMonthlyUsd: 9 * 29 + 3 * 79, generatedAt: "2026-11-24T06:05:00.000Z",
    },
    usage: { subscribersWithUsage: 11, turnsThisPeriod: 4210, atOrAbove80Percent: 2 },
    recent: [
      { at: "2026-11-24T05:40:00.000Z", label: "Started a trial", who: "m***@example.com", applied: true },
      { at: "2026-11-24T03:10:00.000Z", label: "Trial became paid", who: "a***@example.org", applied: true },
      { at: "2026-11-23T11:00:00.000Z", label: "Payment failed", who: "k***@example.com", applied: true },
      { at: "2026-11-23T09:00:00.000Z", label: "Cancelled", who: "z***@example.com", applied: false },
    ],
    generatedAt: "2026-11-24T06:05:00.000Z",
  };
}
export function emptyDashboard(days: 7 | 30 | 90 = 30): Dashboard {
  const s = sampleDashboard(days);
  const z = { trialsStarted: 0, paid: 0, cancelled: 0, refunds: 0, failed: 0 };
  return { ...s, series: s.series.map((p) => ({ date: p.date, ...z })), totals: z, previous: z, funnel: { trialsStarted: 0, trialToPaid: 0 }, stats: { ...s.stats, current: [], estMonthlyUsd: 0, windows: s.stats.windows.map((w) => ({ ...w, trialsStarted: 0, cancelledTrials: 0, trialToPaid: 0, directPaid: 0, paidCancelled: 0, refunds: 0, failedPayments: 0 })) }, usage: { subscribersWithUsage: 0, turnsThisPeriod: 0, atOrAbove80Percent: 0 }, recent: [] };
}
export const sampleFeedback: FeedbackRow[] = [
  { id: "1", createdAt: "2026-11-24T04:00:00.000Z", message: "My daughter loves Mia. Can there be more maths?", contactEmail: "mum@example.com", page: "/learn" },
  { id: "2", createdAt: "2026-11-23T04:00:00.000Z", message: "The voice cut out once.", contactEmail: null, page: null },
];
