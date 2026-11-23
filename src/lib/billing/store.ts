import "server-only";
import postgres from "postgres";
import { TRIAL_DAYS, isPlanId, type Subscription, type SubStatus } from "./plans";
import type { BillingChange } from "./freemius";

/**
 * Server-side billing storage. Talks to Postgres as the narrow `billing_writer` role (see the billing migration),
 * never as service_role, never from the browser. `BILLING_DATABASE_URL` is a server-only secret.
 */
export interface BillingStore {
  /** Current subscription and turns used in its current period. Throws when the database cannot be reached (callers fail closed). */
  lookup(email: string): Promise<{ sub: Subscription | null; usedTurns: number }>;
  /** Idempotent: a replayed event id changes nothing and returns "duplicate". */
  apply(change: BillingChange, now: Date): Promise<"applied" | "duplicate" | "ignored">;
  /** Counts one model turn against the current period. Best effort. */
  addTurn(email: string, periodEnd: string): Promise<void>;
}

const DAY = 86_400_000;
/** ESTIMATE used only when a paid event does not say when the period ends; the next renewal event corrects it. */
const UNKNOWN_PAID_PERIOD_DAYS = 32;

/** The period end to store for a granting event: the event's own date, else a documented estimate. */
export function periodEndFor(change: BillingChange, now: Date): string | null {
  if (change.periodEnd) return change.periodEnd;
  if (change.status === "trialing") return new Date(now.getTime() + TRIAL_DAYS * DAY).toISOString();
  if (change.status === "active") return new Date(now.getTime() + UNKNOWN_PAID_PERIOD_DAYS * DAY).toISOString();
  return null;
}

let client: ReturnType<typeof postgres> | null = null;
/** The one server-only connection (narrow billing_writer role). Also used by the admin numbers and the feedback inbox. */
export function db() {
  const url = process.env.BILLING_DATABASE_URL?.trim();
  if (!url) throw new Error("billing_unconfigured");
  // max 1: one connection per serverless instance. prepare:false: required by Supabase's transaction pooler.
  client ??= postgres(url, { max: 1, prepare: false, ssl: "require", connect_timeout: 5, idle_timeout: 20, max_lifetime: 300 });
  return client;
}
export const billingConfigured = () => Boolean(process.env.BILLING_DATABASE_URL?.trim());

const STOPS: ReadonlySet<SubStatus> = new Set(["past_due", "canceled", "refunded"]);
/** Only these events can start (or restart) access for someone who has no live plan. Renewals and payments cannot. */
const STARTS: ReadonlySet<string> = new Set(["subscription.created", "install.trial.started"]);

/**
 * What to do with a change given the row we already hold. Pure, so the ordering rules are unit-tested.
 *  - A stop only touches an existing row.
 *  - An event the provider dated BEFORE the last one we applied is stale: ignored (a late retry cannot undo a refund).
 *  - A trial start only ever CREATES a row: it can never downgrade a paying plan or hand out a second trial.
 *  - A cancelled or refunded row only comes back through a new purchase (subscription.created), never through a
 *    renewal or payment event that arrives late.
 *  - A past_due row is restored by a renewal or payment.
 */
export function ruleFor(change: BillingChange, cur: { status: SubStatus; lastEventAt: Date | null } | null, now: Date): "grant" | "stop" | "ignore" {
  void now;
  const isStop = STOPS.has(change.status);
  if (!cur) return isStop || !change.plan ? "ignore" : "grant";
  if (change.eventAt && cur.lastEventAt && Date.parse(change.eventAt) < cur.lastEventAt.getTime()) return "ignore";
  if (isStop) return cur.status === "refunded" ? "ignore" : "stop"; // refunded is terminal until a new purchase
  if (!change.plan) return "ignore";
  if (change.type === "install.trial.started") return "ignore"; // one trial per e-mail
  if ((cur.status === "canceled" || cur.status === "refunded") && !STARTS.has(change.type)) return "ignore";
  return "grant";
}

export const pgStore: BillingStore = {
  async lookup(email) {
    const sql = db();
    const rows = await sql<{ plan: string; status: string; period_end: Date | null; turns: number | null }[]>`
      select s.plan, s.status, s.period_end, u.turns
      from public.subscriptions s
      left join public.billing_usage u on u.email_norm = s.email_norm and u.period_end = s.period_end
      where s.email_norm = ${email.toLowerCase()}`;
    const r = rows[0];
    if (!r || !isPlanId(r.plan)) return { sub: null, usedTurns: 0 };
    const sub: Subscription = { plan: r.plan, status: r.status as SubStatus, periodEnd: r.period_end ? r.period_end.toISOString() : null };
    return { sub, usedTurns: r.turns ?? 0 };
  },

  async apply(change, now) {
    const sql = db();
    return sql.begin(async (tx) => {
      // Serialise this buyer (FOR UPDATE alone locks nothing when the row does not exist yet, e.g. two first events at once).
      await tx`select pg_advisory_xact_lock(hashtext(${change.email}))`;
      const cur = (await tx<{ status: string; plan: string; period_end: Date | null; last_event_at: Date | null }[]>`select status, plan, period_end, last_event_at from public.subscriptions where email_norm = ${change.email} for update`)[0] ?? null;
      const prev = cur ? (cur.status as SubStatus) : null;
      const verdict = ruleFor(change, cur ? { status: prev!, lastEventAt: cur.last_event_at } : null, now);
      // The event row is both the idempotency key and the history /admin counts from (what happened, what it was before, did it change anything).
      const ins = await tx`insert into public.billing_events (event_id, type, email_norm, status, prev_status, applied) values (${change.eventId}, ${change.type}, ${change.email}, ${change.status}, ${prev}, ${verdict !== "ignore"}) on conflict (event_id) do nothing returning event_id`;
      if (ins.length === 0) return "duplicate" as const;
      if (verdict === "ignore") return "ignored" as const;
      const at = change.eventAt ?? now.toISOString();
      if (verdict === "stop") {
        // A stop keeps the period it already had (the usage count is keyed by it).
        await tx`update public.subscriptions set status = ${change.status}, last_event_at = ${at}, updated_at = now() where email_norm = ${change.email}`;
        return "applied" as const;
      }
      const estimate = periodEndFor({ ...change, periodEnd: null }, now);
      const keep = cur?.period_end && cur.period_end.getTime() > now.getTime() && cur.plan === change.plan ? cur.period_end.toISOString() : null;
      const end = change.periodEnd ?? keep ?? estimate;
      await tx`insert into public.subscriptions (email_norm, plan, status, period_end, freemius_user_id, freemius_subscription_id, last_event_at)
        values (${change.email}, ${change.plan}, ${change.status}, ${end}, ${change.freemiusUserId}, ${change.freemiusSubscriptionId}, ${at})
        on conflict (email_norm) do update set plan = excluded.plan, status = excluded.status, period_end = excluded.period_end, last_event_at = excluded.last_event_at,
          freemius_user_id = coalesce(excluded.freemius_user_id, public.subscriptions.freemius_user_id),
          freemius_subscription_id = coalesce(excluded.freemius_subscription_id, public.subscriptions.freemius_subscription_id),
          updated_at = now()`;
      return "applied" as const;
    });
  },

  async addTurn(email, periodEnd) {
    const sql = db();
    await sql`insert into public.billing_usage (email_norm, period_end, turns) values (${email.toLowerCase()}, ${periodEnd}, 1)
      on conflict (email_norm, period_end) do update set turns = public.billing_usage.turns + 1`;
  },
};
