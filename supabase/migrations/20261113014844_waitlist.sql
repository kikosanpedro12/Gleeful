-- =============================================================================
-- Gleeful: pre-launch waitlist (parents' email addresses)
-- =============================================================================
--
-- ACCESS MODEL
--   * Written ONLY by our server (POST /api/waitlist) with the secret key
--     (service_role). Browsers never talk to this table: anon and
--     authenticated have no privileges at all, and RLS is on with no policies,
--     so even an accidental grant would expose nothing.
--   * service_role may INSERT only the three data columns, and SELECT (so the
--     API's insert path and ON CONFLICT work on every PostgREST version). It
--     cannot edit or delete through the API. The secret key never leaves the
--     server.
--   * The server stores the email lowercased, so the unique constraint makes a
--     repeat sign-up a no-op (ON CONFLICT DO NOTHING) without telling the
--     visitor whether an address was already on the list.
--
-- DATA MINIMISATION
--   * An adult's email, their consent flag, which form they used, and when.
--     No names, no child data, no IP address, no user agent.
-- =============================================================================

create table public.waitlist (
  id          bigint generated always as identity primary key,
  email       text        not null unique
              check (char_length(email) between 6 and 254
                     and email = lower(email)
                     and email ~ '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$'),
  -- The visitor ticked "I'm a parent or guardian (18+) and agree to be emailed about early access".
  consent     boolean     not null check (consent),
  source      text        not null default 'landing' check (source in ('landing', 'landing_footer')),
  created_at  timestamptz not null default now()
);

comment on table public.waitlist is
  'Pre-launch waitlist. Server-only (service_role insert). Adults only: an email, a consent flag, the form used and the time.';

-- The time is set by the database, never by the caller.
create trigger waitlist_force_created_at
  before insert on public.waitlist
  for each row execute function private.force_created_at();

alter table public.waitlist enable row level security;
-- Deliberately NO policies: anon and authenticated must never see or write a row.

revoke all on table public.waitlist from public, anon, authenticated, service_role;
revoke all on sequence public.waitlist_id_seq from public, anon, authenticated, service_role;
grant select on table public.waitlist to service_role;
grant insert (email, consent, source) on table public.waitlist to service_role;
