-- =============================================================================
-- Gleeful: numbers for /admin (trials, cancels, paid, refunds) and a feedback inbox
-- =============================================================================
-- 1) billing_events gains what happened and what the buyer was before it, so /admin can count
--    "trials started", "cancelled trials", "trial -> paid", "refunds" from OUR mapped statuses (never from a vendor's raw event names).
--    No payload and no e-mail beyond the existing key. Existing rows (none yet in production) keep NULLs.
-- 2) feedback: messages families send from /feedback. Written and read ONLY by the server role billing_writer
--    (no browser role can read, edit or delete anyone's message). It is read-only in /admin.
-- Same rules as the billing migration: RLS on, explicit grants, no SECURITY DEFINER.
-- =============================================================================

alter table public.billing_events
  add column status      text check (status is null or status in ('trialing', 'active', 'past_due', 'canceled', 'refunded')),
  add column prev_status text check (prev_status is null or prev_status in ('trialing', 'active', 'past_due', 'canceled', 'refunded')),
  add column applied     boolean not null default true;
comment on column public.billing_events.status is 'The status our mapper gave this event (not the vendor''s own name).';
comment on column public.billing_events.prev_status is 'The buyer''s status just before this event; NULL = no subscription yet.';
comment on column public.billing_events.applied is 'False when the event was recorded but changed nothing (stale, duplicate purchase, stop with no subscription).';

create table public.feedback (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  message       text not null check (length(btrim(message)) between 1 and 2000),
  contact_email text check (contact_email is null or (length(contact_email) between 3 and 254 and contact_email ~ '^[^@[:space:],;<>"]+@[^@[:space:],;<>"]+\.[^@[:space:],;<>"]+$')),
  page          text check (page is null or page ~ '^/[a-z0-9/_-]{0,58}$')
);
create index feedback_created_at_idx on public.feedback (created_at desc);
comment on table public.feedback is 'Messages from /feedback. Server-only (billing_writer); read-only in /admin. Never shown to other visitors.';
alter table public.feedback enable row level security;
revoke all on table public.feedback from public, anon, authenticated;
grant select, insert on table public.feedback to billing_writer;
create policy "billing_writer reads feedback" on public.feedback for select to billing_writer using (true);
create policy "billing_writer adds feedback"  on public.feedback for insert to billing_writer with check (true);
