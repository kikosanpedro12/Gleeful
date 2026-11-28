import { EVENT_CODES, ERROR_CODES, type EventCode } from "./codes";

/**
 * The one INSERT the app uses for events, with the database-side caps built in (so many instances or addresses cannot
 * flood the table, like the feedback inbox):
 *  - a separate hourly cap PER CODE (CODE_CAPS), so flooding one code (error codes are reachable by anonymous visitors)
 *    cannot starve another (sign-ups);
 *  - a lifetime cap on rows, using count(*). (Not max(id): ON CONFLICT burns identity values, so an id-based cap drifts.)
 *    count(*) over a large table costs time, but it only runs on an insert that already passed the hourly checks, and
 *    the lifetime cap is 1,000,000 rows. If it ever shows up as slow, switch to the reltuples estimate and say so here;
 *  - repeats of once-only events are looked for BEFORE inserting, so a repeat takes no identity value; the unique
 *    indexes (see the migration) still decide a race, and ON CONFLICT DO NOTHING makes it a quiet no-op.
 * Returns a row only when it inserted. Parameters: $1 code, $2 parent_id, $3 utm_source, $4 utm_medium, $5 utm_campaign, $6 referrer_host.
 */
export const CODE_CAPS: Record<EventCode, number> = {
  signup: 500, consent_given: 500, learner_added: 1000, active_day: 2000, checkout_clicked: 200,
  brain_error: 2000, brain_fallback: 2000, voice_error: 2000,
};
export const LIFETIME_CAP = 1_000_000;
export { ERROR_CODES };

export function eventInsertSql(lifetime: number = LIFETIME_CAP): string {
  const cases = EVENT_CODES.map((c) => `when '${c}' then ${CODE_CAPS[c]}`).join(" ");
  return `insert into public.app_events (code, parent_id, utm_source, utm_medium, utm_campaign, referrer_host)
select $1::text, $2::uuid, $3::text, $4::text, $5::text, $6::text
where not exists (select 1 from public.app_events e where e.parent_id = $2::uuid and e.code = $1::text
        and ($1::text in ('signup', 'consent_given')
             or ($1::text in ('active_day', 'checkout_clicked') and e.day = (now() at time zone 'Asia/Manila')::date)))
  and (select count(*) from public.app_events where code = $1::text and created_at > now() - interval '1 hour') < (case $1::text ${cases} else 0 end)
  and (select count(*) from public.app_events) < ${Math.floor(lifetime)}
on conflict do nothing
returning id`;
}
export const EVENT_INSERT_SQL = eventInsertSql();
