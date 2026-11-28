import "server-only";
import { PLANS, isPlanId, turnsForMinutes, type PlanId } from "./plans";
import { db, billingConfigured } from "./store";
import { loadBillingStats, type BillingStats } from "./stats";
import { loadEventStats, type EventStats } from "@/lib/events/stats";

/** Ranges the dashboard offers. Anything else falls back to 30. */
export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];
export function parseRange(x: unknown): RangeDays {
  const n = Number(Array.isArray(x) ? x[0] : x);
  return (RANGES as readonly number[]).includes(n) ? (n as RangeDays) : 30;
}

export interface DayPoint { date: string; trialsStarted: number; paid: number; cancelled: number; refunds: number; failed: number }
export interface Totals { trialsStarted: number; paid: number; cancelled: number; refunds: number; failed: number }
export interface ActivityRow { at: string; label: string; who: string; applied: boolean }

export interface Dashboard {
  days: RangeDays;
  /** One point per day (Asia/Manila days), oldest first, zeros filled in. */
  series: DayPoint[];
  totals: Totals;
  /** Same length of time immediately before the range, for the change arrows. */
  previous: Totals;
  /** Funnel for the range: trials started, of which became paid. Real events only. */
  funnel: { trialsStarted: number; trialToPaid: number };
  stats: BillingStats;
  usage: { subscribersWithUsage: number; turnsThisPeriod: number; atOrAbove80Percent: number };
  recent: ActivityRow[];
  /** First-party product events (funnel, retention, sources, health). Null when the table is missing or could not be read; see eventsNote. */
  events: EventStats | null;
  eventsNote: "not_applied" | "unavailable" | null;
  generatedAt: string;
}

/** "mum@example.com" -> "m***@example.com". The founder needs to recognise a buyer, not to read a list of addresses. */
export function maskEmail(e: string): string {
  const at = e.lastIndexOf("@");
  if (at < 1) return "unknown";
  return `${e[0]}***${e.slice(at)}`;
}

/** What our own mapped statuses mean in plain words (never the vendor's raw event name). */
export function describeChange(status: string | null, prev: string | null): string {
  if (status === "trialing" && !prev) return "Started a trial";
  if (status === "active" && prev === "trialing") return "Trial became paid";
  if (status === "active" && !prev) return "Paid without a trial";
  if (status === "active" && (prev === "canceled" || prev === "past_due")) return prev === "past_due" ? "Payment recovered" : "Came back and paid";
  if (status === "canceled" && prev === "trialing") return "Cancelled during trial";
  if (status === "canceled") return "Cancelled";
  if (status === "refunded") return "Refunded";
  if (status === "past_due") return "Payment failed";
  if (status === "trialing") return "Started another trial";
  return "Other change";
}

const zero = (): Totals => ({ trialsStarted: 0, paid: 0, cancelled: 0, refunds: 0, failed: 0 });
function add(t: Totals, p: Omit<DayPoint, "date">): void {
  t.trialsStarted += p.trialsStarted; t.paid += p.paid; t.cancelled += p.cancelled; t.refunds += p.refunds; t.failed += p.failed;
}

/** Pure: turns per-day rows (covering 2x the range) into the series, the totals and the previous-period totals. */
export function shapeSeries(rows: { d: string; trials_started: number; paid: number; cancelled: number; refunds: number; failed: number }[], days: number, today: string): { series: DayPoint[]; totals: Totals; previous: Totals } {
  const byDay = new Map(rows.map((r) => [r.d, r]));
  const series: DayPoint[] = [];
  const totals = zero();
  const previous = zero();
  const end = new Date(`${today}T00:00:00Z`).getTime();
  for (let i = days * 2 - 1; i >= 0; i--) {
    const date = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    const r = byDay.get(date);
    const p = { trialsStarted: r?.trials_started ?? 0, paid: r?.paid ?? 0, cancelled: r?.cancelled ?? 0, refunds: r?.refunds ?? 0, failed: r?.failed ?? 0 };
    if (i >= days) add(previous, p);
    else { add(totals, p); series.push({ date, ...p }); }
  }
  return { series, totals, previous };
}

/** Everything /admin draws, from the database (no vendor calls). Sequential on the single connection. */
export async function loadDashboard(days: RangeDays, now: Date = new Date()): Promise<Dashboard | null> {
  if (!billingConfigured()) return null;
  const sql = db();
  const stats = await loadBillingStats(now);
  if (!stats) return null;
  const today = new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10); // Manila date
  // Windows start at Manila midnight of their first day, the same boundary the day buckets use (no partial first day).
  const manilaMidnight = (daysBack: number) => new Date(new Date(`${today}T00:00:00+08:00`).getTime() - daysBack * 86_400_000).toISOString();
  const since = manilaMidnight(days * 2 - 1);
  // A slow database must not keep queuing work behind a page that already gave up: stop between queries.
  const stopAt = Date.now() + 4000;
  const guard = () => { if (Date.now() > stopAt) throw new Error("deadline"); };
  const rows = await sql<{ d: string; trials_started: number; paid: number; cancelled: number; refunds: number; failed: number }[]>`
    select to_char((received_at at time zone 'Asia/Manila')::date, 'YYYY-MM-DD') as d,
      count(*) filter (where status = 'trialing' and prev_status is null)::int as trials_started,
      count(*) filter (where status = 'active' and (prev_status is null or prev_status in ('trialing', 'canceled')))::int as paid,
      count(*) filter (where status = 'canceled')::int as cancelled,
      count(*) filter (where status = 'refunded')::int as refunds,
      count(*) filter (where status = 'past_due')::int as failed
    from public.billing_events where applied and received_at >= ${since}
    group by 1`;
  guard();
  const { series, totals, previous } = shapeSeries(rows, days, today);

  const f = (await sql<{ started: number; became_paid: number }[]>`
    select count(*) filter (where status = 'trialing' and prev_status is null)::int as started,
           count(*) filter (where status = 'active' and prev_status = 'trialing')::int as became_paid
    from public.billing_events where applied and received_at >= ${manilaMidnight(days - 1)}`)[0];
  guard();

  const u = await sql<{ plan: string; turns: number }[]>`
    select s.plan, u.turns from public.billing_usage u join public.subscriptions s on s.email_norm = u.email_norm and s.period_end = u.period_end
    where u.period_end > now() order by u.turns desc limit 1000`;
  guard();
  let turnsThisPeriod = 0; let high = 0;
  for (const r of u) {
    turnsThisPeriod += r.turns;
    if (isPlanId(r.plan) && r.turns >= 0.8 * turnsForMinutes(PLANS[r.plan as PlanId].monthlyMinutes)) high++;
  }

  const rec = await sql<{ received_at: Date; status: string | null; prev_status: string | null; email_norm: string; applied: boolean }[]>`
    select received_at, status, prev_status, email_norm, applied from public.billing_events order by received_at desc limit 12`;
  const recent = rec.map((r) => ({ at: r.received_at.toISOString(), label: describeChange(r.status, r.prev_status), who: maskEmail(r.email_norm), applied: r.applied }));

  // Product events: a missing table (migration not applied yet) or a slow read must not hide the billing numbers above.
  let events: EventStats | null = null;
  let eventsNote: Dashboard["eventsNote"] = null;
  try { events = await loadEventStats(days, now, guard); } catch (e) { eventsNote = (e as { code?: unknown })?.code === "42P01" ? "not_applied" : "unavailable"; }

  return { days, series, totals, previous, funnel: { trialsStarted: f?.started ?? 0, trialToPaid: f?.became_paid ?? 0 }, stats, usage: { subscribersWithUsage: u.length, turnsThisPeriod, atOrAbove80Percent: high }, recent, events, eventsNote, generatedAt: now.toISOString() };
}
