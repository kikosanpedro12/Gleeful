-- =============================================================================
-- AI Teacher: learning data for parent-managed child profiles
-- =============================================================================
--
-- ACCESS MODEL
--   * The only people who sign in are PARENTS (auth.users). Children never get
--     their own account; a child uses the app on a parent's signed-in device.
--   * A parent owns learner profiles. Every row of learning data carries
--     parent_id, and COMPOSITE FOREIGN KEYS guarantee that parent_id is the
--     learner's real parent. That makes every RLS policy a cheap equality check
--     ((select auth.uid()) = parent_id) that cannot be tricked by mixing ids.
--   * No SECURITY DEFINER functions. The anon role gets no table access at all.
--   * Rows written only by the server (brain_usage) have no client write grants.
--
-- DATA MINIMISATION (children's data)
--   * Learner: a nickname + grade + language + teacher choice. No birth date,
--     surname, school, photo or location.
--   * No audio is stored anywhere. Attempts store ids, not free text.
--   * Deleting a learner (or the parent's account) deletes all their data.
-- =============================================================================

-- ----------------------------------------------------------------- helpers
-- Private schema: not exposed through the Data API (config.toml: schemas = ["public"]).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Evidence timestamps are set by the database, never by the client.
-- NOTE: until the server writes attempts (Stage B), the attempt's `context`
-- (taught / recheck / later_check) is still asserted by the client. Only the
-- parent's own device can write it, and it only affects their own report.
create or replace function private.force_created_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

revoke all on function private.touch_updated_at() from public, anon, authenticated;
revoke all on function private.force_created_at() from public, anon, authenticated;

-- ----------------------------------------------------------------- learners
create table public.learners (
  id                uuid primary key default gen_random_uuid(),
  parent_id         uuid not null references auth.users (id) on delete cascade,
  nickname          text not null check (char_length(btrim(nickname)) between 1 and 40),
  grade             smallint not null check (grade between 1 and 12),
  language          text not null default 'en' check (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  preferred_teacher text not null default 'leo' check (preferred_teacher in ('leo', 'mia')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Target of the composite foreign keys below.
  constraint learners_id_parent_key unique (id, parent_id)
);
comment on table public.learners is 'Child profile owned by a parent. Minimal data by design.';
create index learners_parent_id_idx on public.learners (parent_id);

create trigger learners_touch_updated_at
  before update on public.learners
  for each row execute function private.touch_updated_at();

-- ----------------------------------------------------------------- lesson sessions
create table public.lesson_sessions (
  id             uuid primary key default gen_random_uuid(),
  learner_id     uuid not null,
  parent_id      uuid not null,
  teacher        text not null check (teacher in ('leo', 'mia')),
  brain          text not null check (brain in ('scripted', 'model')),
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  worlds_visited text[] not null default '{}' check (cardinality(worlds_visited) <= 50),
  constraint lesson_sessions_learner_fk
    foreign key (learner_id, parent_id) references public.learners (id, parent_id) on delete cascade,
  constraint lesson_sessions_ended_after_start check (ended_at is null or ended_at >= started_at),
  -- Target of the attempts → session foreign key (same learner, same parent).
  constraint lesson_sessions_id_learner_parent_key unique (id, learner_id, parent_id)
);
create index lesson_sessions_parent_id_idx on public.lesson_sessions (parent_id);
create index lesson_sessions_learner_started_idx on public.lesson_sessions (learner_id, started_at desc);

-- ----------------------------------------------------------------- attempts (learning evidence)
create table public.attempts (
  id          bigint generated always as identity primary key,
  learner_id  uuid not null,
  parent_id   uuid not null,
  session_id  uuid,
  skill       text not null check (skill ~ '^[a-z0-9_.]{1,80}$'),
  question_id text not null check (question_id ~ '^[a-z0-9_]{1,64}$'),
  answer_id   text not null check (answer_id ~ '^[a-z0-9_]{1,64}$'),
  correct     boolean not null,
  hints_used  smallint not null default 0 check (hints_used between 0 and 20),
  -- taught: during the lesson · recheck: no-hint check, same session ·
  -- later_check: no-hint check in a later session (the only proof of independence)
  context     text not null check (context in ('taught', 'recheck', 'later_check')),
  created_at  timestamptz not null default now(),
  constraint attempts_learner_fk
    foreign key (learner_id, parent_id) references public.learners (id, parent_id) on delete cascade,
  -- The session must belong to the SAME learner and parent. Deleting a session keeps the evidence.
  constraint attempts_session_fk
    foreign key (session_id, learner_id, parent_id)
    references public.lesson_sessions (id, learner_id, parent_id)
    on delete set null (session_id)
);
comment on table public.attempts is 'Append-only learning evidence. Clients may insert and delete, never edit. context is client-asserted until the server writes attempts.';
create index attempts_parent_id_idx on public.attempts (parent_id);
create index attempts_learner_skill_created_idx on public.attempts (learner_id, skill, created_at);
create index attempts_session_id_idx on public.attempts (session_id) where session_id is not null;

create trigger attempts_force_created_at
  before insert on public.attempts
  for each row execute function private.force_created_at();

-- ----------------------------------------------------------------- brain usage (spend control)
-- Written ONLY by the server (secret key, Stage B) to enforce per-child limits.
-- Parents can read their own rows. No client write access at all.
create table public.brain_usage (
  learner_id    uuid not null,
  parent_id     uuid not null,
  day           date not null default current_date,
  turns         integer not null default 0 check (turns >= 0),
  input_tokens  bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  primary key (learner_id, day),
  constraint brain_usage_learner_fk
    foreign key (learner_id, parent_id) references public.learners (id, parent_id) on delete cascade
);
create index brain_usage_parent_id_idx on public.brain_usage (parent_id);

-- ----------------------------------------------------------------- privileges
-- Start from nothing, then grant exactly what each role needs.
revoke all on table public.learners, public.lesson_sessions, public.attempts, public.brain_usage from public, anon, authenticated;

-- Updates are column-scoped: a parent can rename a child or end a session, but
-- can never rewrite ids, ownership, or timestamps.
grant select, insert, delete on table public.learners        to authenticated;
grant update (nickname, grade, language, preferred_teacher)
                             on table public.learners        to authenticated;
grant select, insert, delete on table public.lesson_sessions to authenticated;
grant update (ended_at, worlds_visited)
                             on table public.lesson_sessions to authenticated;
grant select, insert, delete on table public.attempts        to authenticated;  -- no update: evidence is append-only
grant select                 on table public.brain_usage     to authenticated;  -- server writes only

-- The identity sequence: inserts through the identity column need no grant.
-- Revoke Supabase's default sequence grants so nobody can read or setval() it.
revoke all on sequence public.attempts_id_seq from public, anon, authenticated;

grant select, insert, update, delete on table public.learners, public.lesson_sessions, public.attempts, public.brain_usage to service_role;

-- ----------------------------------------------------------------- row-level security
alter table public.learners        enable row level security;
alter table public.lesson_sessions enable row level security;
alter table public.attempts        enable row level security;
alter table public.brain_usage     enable row level security;

-- learners
create policy "parents read own learners" on public.learners
  for select to authenticated using ((select auth.uid()) = parent_id);
create policy "parents add own learners" on public.learners
  for insert to authenticated with check ((select auth.uid()) = parent_id);
create policy "parents edit own learners" on public.learners
  for update to authenticated using ((select auth.uid()) = parent_id) with check ((select auth.uid()) = parent_id);
create policy "parents delete own learners" on public.learners
  for delete to authenticated using ((select auth.uid()) = parent_id);

-- lesson_sessions
create policy "parents read own sessions" on public.lesson_sessions
  for select to authenticated using ((select auth.uid()) = parent_id);
create policy "parents add own sessions" on public.lesson_sessions
  for insert to authenticated with check ((select auth.uid()) = parent_id);
create policy "parents edit own sessions" on public.lesson_sessions
  for update to authenticated using ((select auth.uid()) = parent_id) with check ((select auth.uid()) = parent_id);
create policy "parents delete own sessions" on public.lesson_sessions
  for delete to authenticated using ((select auth.uid()) = parent_id);

-- attempts
create policy "parents read own attempts" on public.attempts
  for select to authenticated using ((select auth.uid()) = parent_id);
create policy "parents add own attempts" on public.attempts
  for insert to authenticated with check ((select auth.uid()) = parent_id);
create policy "parents delete own attempts" on public.attempts
  for delete to authenticated using ((select auth.uid()) = parent_id);

-- brain_usage
create policy "parents read own usage" on public.brain_usage
  for select to authenticated using ((select auth.uid()) = parent_id);
