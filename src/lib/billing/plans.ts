/**
 * Plans, trial and monthly allowance rules. Pure functions: no I/O, no secrets, safe to import anywhere.
 *
 * Money and limits come from the founder's decisions (23 Nov 2026): Solo US$29/mo up to 10 h, Family US$79/mo up to 40 h,
 * 7-day card-required trial capped at 2 h of live teaching. These are the sellable promises, so they live in ONE place.
 *
 * HONEST STATUS: usage is counted in model turns (the server sees those), converted to hours with an ESTIMATE of
 * 2.7 turns per live minute (config/pricing.json "assumptions.turnsPerMinute"). It is a brake that protects margin,
 * not a stopwatch. Revisit when real sessions give a measured number.
 */
export type PlanId = "solo" | "family";
export type SubStatus = "trialing" | "active" | "past_due" | "canceled" | "refunded";

export const PLANS: Readonly<Record<PlanId, { priceUsd: number; monthlyMinutes: number; maxChildren: number }>> = Object.freeze({
  solo: Object.freeze({ priceUsd: 29, monthlyMinutes: 600, maxChildren: 1 }),
  family: Object.freeze({ priceUsd: 79, monthlyMinutes: 2400, maxChildren: 4 }),
});
export const TRIAL_DAYS = 7;
export const TRIAL_MINUTES = 120;
/** ESTIMATE (see header). */
export const TURNS_PER_MINUTE = 2.7;

export function isPlanId(x: unknown): x is PlanId {
  return typeof x === "string" && Object.hasOwn(PLANS, x);
}

export function turnsForMinutes(minutes: number): number {
  return Math.floor(minutes * TURNS_PER_MINUTE);
}

export interface Subscription {
  plan: PlanId;
  status: SubStatus;
  /** ISO time the trial ends (trialing) or the paid period ends (active/past_due/canceled). */
  periodEnd: string | null;
}

export type Decision =
  | { allowed: true; turnsLeft: number; capTurns: number }
  | { allowed: false; reason: "no_subscription" | "inactive" | "expired" | "cap_reached" };

/**
 * Can this parent use the live tutor right now?
 * - no subscription row, refunded: no.
 * - trialing: yes until the trial end, and until the 2 h trial allowance is used.
 * - active: yes until the plan's monthly allowance is used.
 * - past_due: no (payment failed; they can fix it in the Freemius portal).
 * - canceled: yes only until the period they already paid for ends.
 * `usedTurns` is the usage inside the CURRENT period only (the caller resets it each period).
 */
export function decide(sub: Subscription | null, usedTurns: number, now: Date): Decision {
  if (!sub) return { allowed: false, reason: "no_subscription" };
  if (!isPlanId(sub.plan)) return { allowed: false, reason: "no_subscription" };
  if (sub.status === "refunded" || sub.status === "past_due") return { allowed: false, reason: "inactive" };
  const end = sub.periodEnd ? Date.parse(sub.periodEnd) : NaN;
  if (sub.status === "trialing" || sub.status === "canceled") {
    if (!Number.isFinite(end) || end <= now.getTime()) return { allowed: false, reason: "expired" };
  }
  // An active plan always has a period end (the database allows null, the app must not treat it as unlimited).
  if (sub.status === "active" && (!Number.isFinite(end) || end <= now.getTime())) return { allowed: false, reason: "expired" };
  const capTurns = turnsForMinutes(sub.status === "trialing" ? TRIAL_MINUTES : PLANS[sub.plan].monthlyMinutes);
  const used = Number.isFinite(usedTurns) && usedTurns > 0 ? Math.floor(usedTurns) : 0;
  if (used >= capTurns) return { allowed: false, reason: "cap_reached" };
  return { allowed: true, turnsLeft: capTurns - used, capTurns };
}
