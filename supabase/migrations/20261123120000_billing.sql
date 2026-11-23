-- =============================================================================
-- Gleeful: billing (subscriptions, webhook idempotency, usage per period)
-- =============================================================================
--
-- WHY
--   Freemius (merchant of record) tells our server by signed webhook when a family starts a trial, pays, renews,
--   cancels or is refunded. The server needs to REMEMBER that, and count lesson usage against the plan's allowance.
--
-- WHO MAY TOUCH THESE TABLES
--   * anon and authenticated (the browser's roles): NOTHING. RLS is on with no policy, and every grant is revoked.
--     A parent can therefore never read, edit or reset their own plan or usage from a browser.
--   * billing_writer: a dedicated, narrow database role used ONLY by server code (src/lib/billing/db.ts) over a
--     direct connection. It is not service_role, has no BYPASSRLS, and is granted only the exact statements below.
--     It cannot delete anything, cannot edit a subscription's email key, and cannot see any other table.
--     The app keeps its rule of never holding a service_role key.
--   * Rows are keyed by the buyer's e-mail (lower case), because that is what Freemius sends. The signed-in parent's
--     VERIFIED e-mail from the session is the lookup key.
--
-- NO SECURITY DEFINER anywhere. The login password for billing_writer is set outside this file (never committed).
-- Safe to run once. Apply AFTER the earlier migrations.
-- =============================================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'billing_writer') then
    create role billing_writer nologin noinherit nobypassrls;
  end if;
end $$;

create table public.subscriptions (
  email_norm      text primary key check (email_norm = lower(email_norm) and length(email_norm) between 3 and 254 and email_norm ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  plan            text not null check (plan in ('solo', 'family')),
  status          text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'refunded')),
  period_end      timestamptz,
  freemius_user_id text check (freemius_user_id is null or length(freemius_user_id) <= 40),
  freemius_subscription_id text check (freemius_subscription_id is null or length(freemius_subscription_id) <= 40),
  last_event_at   timestamptz,
  updated_at      timestamptz not null default now()
);
comment on table public.subscriptions is 'One row per buyer e-mail: current plan and status from Freemius webhooks. Server-only (billing_writer); no browser role can read or write it.';

create table public.billing_events (
  event_id    text primary key check (length(event_id) between 1 and 80),
  type        text not null check (length(type) between 1 and 80),
  email_norm  text not null check (length(email_norm) between 3 and 254),
  received_at timestamptz not null default now()
);
comment on table public.billing_events is 'Webhook ids already handled (idempotency: a replayed event changes nothing). No payload, no card data.';

create table public.billing_usage (
  email_norm text not null check (length(email_norm) between 3 and 254),
  period_end timestamptz not null,
  turns      integer not null default 0 check (turns >= 0),
  primary key (email_norm, period_end)
);
comment on table public.billing_usage is 'Model turns used inside one paid period (keyed by the period end, so a renewal starts a fresh count). Server-only.';

alter table public.subscriptions  enable row level security;
alter table public.billing_events enable row level security;
alter table public.billing_usage  enable row level security;

-- Explicit grants: nothing for the browser roles, exactly these statements for billing_writer.
revoke all on table public.subscriptions, public.billing_events, public.billing_usage from public, anon, authenticated;
grant usage on schema public to billing_writer;
grant select, insert on table public.subscriptions to billing_writer;
grant update (plan, status, period_end, freemius_user_id, freemius_subscription_id, last_event_at, updated_at) on table public.subscriptions to billing_writer;
grant select, insert on table public.billing_events to billing_writer;
grant select, insert on table public.billing_usage to billing_writer;
grant update (turns) on table public.billing_usage to billing_writer;

-- RLS applies to billing_writer too (it has no BYPASSRLS): give it exactly the rows operations it needs, for itself only.
create policy "billing_writer reads subscriptions"  on public.subscriptions  for select to billing_writer using (true);
create policy "billing_writer adds subscriptions"   on public.subscriptions  for insert to billing_writer with check (true);
create policy "billing_writer updates subscriptions" on public.subscriptions for update to billing_writer using (true) with check (true);
create policy "billing_writer reads events"  on public.billing_events for select to billing_writer using (true);
create policy "billing_writer adds events"   on public.billing_events for insert to billing_writer with check (true);
create policy "billing_writer reads usage"   on public.billing_usage for select to billing_writer using (true);
create policy "billing_writer adds usage"    on public.billing_usage for insert to billing_writer with check (true);
create policy "billing_writer updates usage" on public.billing_usage for update to billing_writer using (true) with check (true);
