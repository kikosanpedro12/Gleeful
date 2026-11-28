import "server-only";
import { db } from "@/lib/billing/store";

/**
 * Numbers for /admin built from public.app_events. Counts of DISTINCT PARENTS (pseudonymous ids that never leave the
 * database) or of event rows; nothing here names or identifies anyone. Days are Asia/Manila days.
 */
export interface EventStats {
  days: number;
  /** Distinct parents with the event on at least one day in the range. */
  funnel: { signups: number; consents: number; learners: number; active: number; checkoutClicks: number };
  retention: { activeToday: number; active7: number; active30: number; quiet: number; signupsEver: number };
  /** Sign-ups in the range by where they came from, top 10. kind: a utm_source campaign, a referrer site, or neither. */
  sources: { name: string; kind: "campaign" | "referrer" | "direct"; count: number }[];
  /** One point per day, oldest first, zeros filled in. */
  health: HealthPoint[];
  healthTotals: { brainError: number; brainFallback: number; voiceError: number };
  generatedAt: string;
}
export interface HealthPoint { date: string; brainError: number; brainFallback: number; voiceError: number }

const DAY = 86_400_000;
/** The Manila calendar date (YYYY-MM-DD) of an instant. */
export const manilaDate = (now: Date): string => new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
/** `n` days before a YYYY-MM-DD date. */
export const daysBefore = (ymd: string, n: number): string => new Date(Date.parse(`${ymd}T00:00:00Z`) - n * DAY).toISOString().slice(0, 10);

/** Pure: per-day error rows (any order, missing days) into one zero-filled point per day. Unknown codes are ignored. */
export function shapeHealth(rows: { d: string; code: string; n: number }[], days: number, today: string): { points: HealthPoint[]; totals: EventStats["healthTotals"] } {
  const by = new Map<string, HealthPoint>();
  const points: HealthPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const p = { date: daysBefore(today, i), brainError: 0, brainFallback: 0, voiceError: 0 };
    by.set(p.date, p); points.push(p);
  }
  const totals = { brainError: 0, brainFallback: 0, voiceError: 0 };
  for (const r of rows) {
    const p = by.get(r.d); const n = Number(r.n) || 0;
    if (!p) continue;
    if (r.code === "brain_error") { p.brainError += n; totals.brainError += n; }
    else if (r.code === "brain_fallback") { p.brainFallback += n; totals.brainFallback += n; }
    else if (r.code === "voice_error") { p.voiceError += n; totals.voiceError += n; }
  }
  return { points, totals };
}

export function shapeSources(rows: { source: string | null; kind: string; n: number }[]): EventStats["sources"] {
  return rows.slice(0, 10).map((r) => {
    const kind = r.kind === "campaign" || r.kind === "referrer" ? r.kind : "direct";
    return { name: kind === "direct" || !r.source ? "No campaign tag or referrer" : r.source, kind, count: Number(r.n) || 0 };
  });
}

/**
 * Sequential on the single billing connection; `guard` is loadDashboard's deadline check (throws between queries).
 * Throws when the table is missing or the database fails: the caller turns that into a friendly note.
 */
export async function loadEventStats(days: number, now: Date, guard: () => void = () => {}): Promise<EventStats> {
  const sql = db();
  const today = manilaDate(now);
  const from = daysBefore(today, days - 1);
  const d7 = daysBefore(today, 6);
  const d30 = daysBefore(today, 29);
  const minDay = from < d30 ? from : d30;

  const f = (await sql<Record<string, number>[]>`
    select
      count(distinct parent_id) filter (where code = 'signup' and day >= ${from}::date)::int as signups,
      count(distinct parent_id) filter (where code = 'consent_given' and day >= ${from}::date)::int as consents,
      count(distinct parent_id) filter (where code = 'learner_added' and day >= ${from}::date)::int as learners,
      count(distinct parent_id) filter (where code = 'active_day' and day >= ${from}::date)::int as active,
      count(distinct parent_id) filter (where code = 'checkout_clicked' and day >= ${from}::date)::int as checkouts,
      count(distinct parent_id) filter (where code = 'active_day' and day = ${today}::date)::int as active_today,
      count(distinct parent_id) filter (where code = 'active_day' and day >= ${d7}::date)::int as active7,
      count(distinct parent_id) filter (where code = 'active_day' and day >= ${d30}::date)::int as active30
    from public.app_events where parent_id is not null and day >= ${minDay}::date`)[0] ?? {};
  guard();

  const q = (await sql<{ quiet: number; total: number }[]>`
    select (select count(*) from public.app_events where code = 'signup')::int as total,
      count(*)::int as quiet
    from public.app_events s
    where s.code = 'signup' and s.created_at < ${new Date(now.getTime() - 7 * DAY).toISOString()}::timestamptz
      and not exists (select 1 from public.app_events a where a.parent_id = s.parent_id and a.code = 'active_day' and a.day >= ${d7}::date)`)[0];
  guard();

  const src = await sql<{ source: string | null; kind: string; n: number }[]>`
    select coalesce(utm_source, referrer_host) as source,
      case when utm_source is not null then 'campaign' when referrer_host is not null then 'referrer' else 'direct' end as kind,
      count(*)::int as n
    from public.app_events where code = 'signup' and day >= ${from}::date
    group by 1, 2 order by n desc, 1 limit 10`;
  guard();

  const hr = await sql<{ d: string; code: string; n: number }[]>`
    select to_char(day, 'YYYY-MM-DD') as d, code, count(*)::int as n
    from public.app_events where code in ('brain_error', 'brain_fallback', 'voice_error') and day >= ${from}::date
    group by 1, 2`;
  const { points, totals } = shapeHealth(hr, days, today);

  return {
    days,
    funnel: { signups: f.signups ?? 0, consents: f.consents ?? 0, learners: f.learners ?? 0, active: f.active ?? 0, checkoutClicks: f.checkouts ?? 0 },
    retention: { activeToday: f.active_today ?? 0, active7: f.active7 ?? 0, active30: f.active30 ?? 0, quiet: q?.quiet ?? 0, signupsEver: q?.total ?? 0 },
    sources: shapeSources(src), health: points, healthTotals: totals, generatedAt: now.toISOString(),
  };
}
