-- =============================================================================
-- Gleeful: learner interests (fixed list) and "how to say the name"
-- =============================================================================
--
-- Phase 1 of personalisation, parent area only. NOT applied live (the founder
-- pastes it into the SQL Editor after review). Nothing child-facing reads these yet.
--
--   interests : up to 5 ids from a FIXED list, no duplicates. A parent picks them;
--               free text is never stored. Keep the list in step with
--               src/lib/learner/interests.ts (tests/interests.test.ts fails if not).
--   name_say  : optional respelling of the nickname for the voice, e.g. 'GAD-dee'.
--               1-40 characters, ASCII letters, spaces, hyphens, apostrophes only.
--
--   * Both columns are additive (default '{}' / null): existing rows stay valid.
--   * RLS stays on; the existing owner-only policies cover the new columns.
--   * The column-scoped UPDATE grant is extended by exactly these two columns, so a
--     parent still cannot rewrite ids, ownership or timestamps. INSERT is table-level.
--   * No function is used in the checks (no SECURITY DEFINER); uniqueness is checked
--     pairwise, which is complete because the array holds at most 5 items.
--
-- Safe to run twice.
-- =============================================================================

alter table public.learners add column if not exists interests text[] not null default '{}';
alter table public.learners add column if not exists name_say text;

alter table public.learners drop constraint if exists learners_interests_check;
alter table public.learners add constraint learners_interests_check check (
  (array_ndims(interests) is null or array_ndims(interests) = 1)
  -- positions must start at 1 (Postgres allows custom bounds like '[5:6]={a,a}', which would skip the duplicate checks)
  and (array_lower(interests, 1) is null or array_lower(interests, 1) = 1)
  and cardinality(interests) <= 5
  and interests <@ array[
    'animals','dinosaurs','ocean','nature','space','robots','vehicles','building','football',
    'basketball','art','music_dance','stories','superheroes','cooking','games_puzzles','experiments'
  ]::text[]
  -- no duplicates: each item must not appear again later in the array
  and (interests[1] is null or not (interests[1] = any (interests[2:5])))
  and (interests[2] is null or not (interests[2] = any (interests[3:5])))
  and (interests[3] is null or not (interests[3] = any (interests[4:5])))
  and (interests[4] is null or interests[4] is distinct from interests[5])
);

alter table public.learners drop constraint if exists learners_name_say_check;
alter table public.learners add constraint learners_name_say_check check (
  name_say is null or (char_length(name_say) between 1 and 40 and name_say ~ '^[A-Za-z][A-Za-z '' -]*$')
);

comment on column public.learners.interests is 'Up to 5 ids from a fixed list chosen by the parent. Never free text.';
comment on column public.learners.name_say is 'Optional respelling of the nickname for the voice (letters, spaces, hyphens, apostrophes).';

grant update (interests, name_say) on table public.learners to authenticated;
