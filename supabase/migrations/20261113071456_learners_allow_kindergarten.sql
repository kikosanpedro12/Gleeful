-- =============================================================================
-- Gleeful: allow kindergarten (stored as grade 0)
-- =============================================================================
--
-- The product and the public copy say "kindergarten to grade 12", but the first
-- schema only allowed grades 1-12. Widen the check to 0-12 (0 = kindergarten).
--
--   * Widening only: every existing row (grades 1-12) still satisfies it, so no
--     data is touched and nothing is rewritten.
--   * Grants, policies and triggers are unchanged. The column-scoped UPDATE
--     grant already covers `grade`, so a parent can still change nothing else.
--   * Keep in step with src/lib/learner/grades.ts (tests/grades.test.ts fails if not).
--
-- Safe to run twice: the old constraint is dropped if present, the new one is
-- only added if it is missing.
-- =============================================================================

alter table public.learners drop constraint if exists learners_grade_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.learners'::regclass and conname = 'learners_grade_check'
  ) then
    alter table public.learners
      add constraint learners_grade_check check (grade between 0 and 12);
  end if;
end $$;

comment on column public.learners.grade is '0 = kindergarten, 1-12 = grade 1-12.';
