import { PLANS, TRIAL_MINUTES, TURNS_PER_MINUTE, decide, type Subscription } from "./plans";

export interface BillingSummary {
  headline: string;
  detail: string;
  canSubscribe: boolean;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : "");
const minutes = (turns: number) => Math.round(turns / TURNS_PER_MINUTE);

/** Plain-words status for the parent area. Minutes are ESTIMATES (turns divided by 2.7) and are labelled that way. */
export function summarize(sub: Subscription | null, usedTurns: number, now: Date): BillingSummary {
  const d = decide(sub, usedTurns, now);
  if (!sub) return { headline: "No plan yet", detail: "Start a free trial to use the live AI teacher. The checkout page shows exactly what the trial includes and when you are first charged.", canSubscribe: true };
  const cap = sub.status === "trialing" ? TRIAL_MINUTES : PLANS[sub.plan].monthlyMinutes;
  const used = `About ${minutes(usedTurns)} of ${cap} minutes used (an estimate).`;
  if (sub.status === "refunded") return { headline: "Refunded", detail: "This purchase was refunded, so the live AI teacher is off. You can start again any time.", canSubscribe: true };
  if (sub.status === "past_due") return { headline: "Payment didn't go through", detail: "The live AI teacher is paused until the payment is fixed. Freemius e-mailed you a link to update your payment details.", canSubscribe: false };
  if (!d.allowed && d.reason === "expired") return { headline: sub.status === "trialing" ? "Trial ended" : "Plan ended", detail: "Choose a plan to keep using the live AI teacher.", canSubscribe: true };
  if (!d.allowed && d.reason === "cap_reached") return { headline: sub.status === "trialing" ? "Trial time used" : "This month's time is used", detail: `${used} It resets ${sub.status === "trialing" ? "when you choose a plan" : "at your next renewal on " + fmt(sub.periodEnd)}.`, canSubscribe: sub.status === "trialing" };
  if (sub.status === "trialing") return { headline: "Free trial", detail: `${sub.plan[0].toUpperCase() + sub.plan.slice(1)} trial until ${fmt(sub.periodEnd)}, then it renews unless you cancel. ${used}`, canSubscribe: false };
  if (sub.status === "canceled") return { headline: "Cancelled", detail: `The live AI teacher works until ${fmt(sub.periodEnd)}, the end of what you paid for. ${used}`, canSubscribe: false };
  return { headline: `${sub.plan[0].toUpperCase() + sub.plan.slice(1)} plan`, detail: `Renews around ${fmt(sub.periodEnd)}. ${used}`, canSubscribe: false };
}
