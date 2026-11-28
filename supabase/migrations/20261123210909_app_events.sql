-- =============================================================================
-- Gleeful: first-party product events for /admin (funnel, retention, sources, health)
-- =============================================================================
-- COUNTS ONLY. A row says "this happened, on this day, for this pseudonymous parent id". It never holds a child's name,
-- nickname, answer, question, lesson text, an e-mail address or an IP address. The only free-form-ish columns are three
-- campaign tags (utm_*) and a referrer HOST, each held to a strict pattern by a CHECK.
--
-- WHO MAY TOUCH IT
--   * anon, authenticated (browser roles): NOTHING (RLS on, no policy, every grant revoked).
--   * billing_writer (server-only role, no BYPASSRLS, same one as billing and feedback): INSERT and SELECT only.
--     No update, no delete. Deleting one family's events on request is done by hand in the SQL Editor, by parent_id.
--
-- RULES IN THE TABLE ITSELF
--   * code is one of a fixed list. Error codes never carry a parent id; every other code must carry one.
--   * signup and consent_given happen once per parent; active_day and checkout_clicked once per parent per Manila day;
--     the unique indexes make the app's INSERT ... ON CONFLICT DO NOTHING a no-op for repeats.
--   * day is a Manila (Asia/Manila) date computed by the database from created_at; the app cannot choose it.
--
-- The write cap for anonymous-reachable codes (error codes) lives in the app's INSERT statement (src/lib/events/cap.ts),
-- like the feedback inbox: a separate hourly cap PER CODE (so flooding one code cannot starve another) and 1,000,000 rows in total.
-- NO SECURITY DEFINER, no trigger, nothing on auth.*. Apply AFTER 20261123150000_billing_stats_feedback.sql.
-- =============================================================================

create table public.app_events (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  day          date generated always as ((created_at at time zone 'Asia/Manila')::date) stored,
  code         text not null check (code in ('signup', 'consent_given', 'learner_added', 'active_day', 'checkout_clicked', 'brain_error', 'brain_fallback', 'voice_error')),
  parent_id    uuid,
  utm_source   text check (utm_source   is null or utm_source   ~ '^[a-z0-9_.-]{1,40}$'),
  utm_medium   text check (utm_medium   is null or utm_medium   ~ '^[a-z0-9_.-]{1,40}$'),
  utm_campaign text check (utm_campaign is null or utm_campaign ~ '^[a-z0-9_.-]{1,40}$'),
  referrer_host text check (referrer_host is null or (length(referrer_host) between 3 and 100 and referrer_host ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$')),
  check ((code in ('brain_error', 'brain_fallback', 'voice_error') and parent_id is null)
      or (code not in ('brain_error', 'brain_fallback', 'voice_error') and parent_id is not null))
);
comment on table public.app_events is 'Content-free product events (counts only). Server-only (billing_writer). Manual deletion by parent_id on request.';
comment on column public.app_events.parent_id is 'Pseudonymous Supabase user id. Never an e-mail. Null for error codes.';
comment on column public.app_events.day is 'Asia/Manila calendar day of created_at, set by the database.';

create unique index app_events_once_per_parent on public.app_events (code, parent_id) where code in ('signup', 'consent_given');
create unique index app_events_active_day_once on public.app_events (parent_id, day) where code = 'active_day';
create unique index app_events_checkout_once_a_day on public.app_events (parent_id, day) where code = 'checkout_clicked';
create index app_events_code_created_idx on public.app_events (code, created_at);
create index app_events_created_idx on public.app_events (created_at);
create index app_events_parent_idx on public.app_events (parent_id, code);

alter table public.app_events enable row level security;
revoke all on table public.app_events from public, anon, authenticated;
revoke all on sequence public.app_events_id_seq from public, anon, authenticated; -- Supabase's default privileges would otherwise hand the id counter to the browser roles
grant select, insert on table public.app_events to billing_writer;
create policy "billing_writer reads events" on public.app_events for select to billing_writer using (true);
create policy "billing_writer adds events"  on public.app_events for insert to billing_writer with check (true);
