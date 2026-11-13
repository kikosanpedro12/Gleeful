-- =============================================================================
-- Gleeful: parental consent records
-- =============================================================================
--
-- WHY
--   Gleeful lets a parent add children and, when the AI teacher is on, sends what a
--   child types to an AI service. A parent must agree to that, in plain words, before
--   either happens. This table is the record that they did, and to WHICH wording.
--
-- WHAT IS STORED
--   One row per agreement: the parent, the version id of the wording they saw
--   (src/lib/consent/text.ts; the words themselves live in code, versioned), when they
--   agreed, and when (if ever) they withdrew. Nothing about the child.
--
-- RULES (all enforced by Postgres, not by the app)
--   * Rows are owner-only (RLS), like every other table here. anon gets nothing.
--   * The time of agreeing and the time of withdrawing are set by the database. A client
--     cannot back-date either.
--   * A parent can add a row and withdraw it. They cannot edit anything else, cannot
--     un-withdraw, and cannot delete the row (it is the record that consent was given
--     and withdrawn). It is deleted when the parent's account is deleted (cascade).
--   * Only ONE active (not withdrawn) agreement per parent per wording version.
--   * No SECURITY DEFINER functions. Triggers run as the caller.
--
-- Safe to run once. Apply AFTER 20261112051808_init_learning_schema.sql (it uses private.*).
-- =============================================================================

create or replace function private.force_accepted_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.accepted_at := now();
  new.withdrawn_at := null; -- a new agreement starts active, whatever the client sent
  return new;
end;
$$;

-- Withdrawing: the database stamps the time; once withdrawn, always withdrawn; nothing else may change.
create or replace function private.guard_consent_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.id := old.id;
  new.parent_id := old.parent_id;
  new.consent_text_version := old.consent_text_version;
  new.accepted_at := old.accepted_at;
  if old.withdrawn_at is not null then
    new.withdrawn_at := old.withdrawn_at;   -- cannot be undone or re-dated
  elsif new.withdrawn_at is not null then
    new.withdrawn_at := now();              -- the database decides when
  end if;
  return new;
end;
$$;

revoke all on function private.force_accepted_at() from public, anon, authenticated;
revoke all on function private.guard_consent_update() from public, anon, authenticated;

create table public.parental_consents (
  id                   uuid primary key default gen_random_uuid(),
  parent_id            uuid not null references auth.users (id) on delete cascade,
  consent_text_version text not null check (consent_text_version ~ '^[A-Za-z0-9._-]{1,32}$'),
  accepted_at          timestamptz not null default now(),
  withdrawn_at         timestamptz,
  constraint parental_consents_withdrawn_after_accepted check (withdrawn_at is null or withdrawn_at >= accepted_at)
);
comment on table public.parental_consents is 'A parent agreeing to a specific wording (consent_text_version) of the consent text. Owner-only; time stamps set by the database; withdraw-only, never deleted by clients.';
create index parental_consents_parent_id_idx on public.parental_consents (parent_id);
create unique index parental_consents_one_active_per_version
  on public.parental_consents (parent_id, consent_text_version) where withdrawn_at is null;

create trigger parental_consents_force_accepted_at
  before insert on public.parental_consents
  for each row execute function private.force_accepted_at();
create trigger parental_consents_guard_update
  before update on public.parental_consents
  for each row execute function private.guard_consent_update();

-- ----------------------------------------------------------------- privileges
revoke all on table public.parental_consents from public, anon, authenticated;
grant select, insert on table public.parental_consents to authenticated;
grant update (withdrawn_at) on table public.parental_consents to authenticated;  -- withdraw only
grant select, insert, update, delete on table public.parental_consents to service_role;

-- ----------------------------------------------------------------- row-level security
alter table public.parental_consents enable row level security;

create policy "parents read own consent" on public.parental_consents
  for select to authenticated using ((select auth.uid()) = parent_id);
create policy "parents give own consent" on public.parental_consents
  for insert to authenticated with check ((select auth.uid()) = parent_id);
create policy "parents withdraw own consent" on public.parental_consents
  for update to authenticated using ((select auth.uid()) = parent_id) with check ((select auth.uid()) = parent_id);
