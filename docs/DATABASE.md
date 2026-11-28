# Database (Supabase) — project `gleeful` (ref ptuglrngmovoryqqmtsw) created 13 Nov 2026; migration applied by hand in the SQL Editor (GitHub auto-deploy needs Pro)

Migration: `supabase/migrations/20261112051808_init_learning_schema.sql`. Local config: `supabase/config.toml`.

## Tables
| Table | Rows | Who can do what |
|---|---|---|
| `learners` | One per child: nickname, grade 0–12, language, preferred teacher, `interests` (up to 5 ids from a fixed list of 17, no duplicates), `name_say` (optional respelling, ≤40 chars, ASCII letters/space/hyphen/apostrophe) | Parent: read, add, edit, delete their own |
| `lesson_sessions` | One per lesson: teacher, scripted/model brain, worlds visited, start/end | Parent: read, add, edit, delete their own |
| `attempts` | One per answer: skill, question, answer ids, correct, hints, context | Parent: read, add, delete their own. **No edits** (evidence). The database sets the time. |
| `brain_usage` | Per child per day: turns, tokens | Parent: read their own. **Only the server writes.** |

`auth.users` (Supabase Auth) holds the parent accounts. Children have no accounts.

## How isolation works
- Every row has `parent_id`. RLS allows a row only when `parent_id = (select auth.uid())`.
- Composite foreign keys, (learner_id, parent_id) → learners and (session_id, learner_id, parent_id) → sessions, make it impossible to store a row whose `parent_id` is not the learner's real parent, or to attach one child's answer to another child's session.
- `anon` (signed-out visitors) has no table privileges at all.
- No `SECURITY DEFINER` functions. Helper triggers live in a `private` schema that the API does not expose.

## Proof
- `npm test` runs the real migration on real Postgres (PGlite), with stand-ins for Supabase's roles and `auth.uid()` (`tests/db/supabase-stub.sql`). Two parents and an anonymous visitor try to read, write, move and tamper with each other's data.
- `node scripts/mutate-rls.mjs` plants 15 security holes, one at a time. The tests must fail for every one.

## Going live (Stage E) — steps
1. Done 13 Nov: project created (ap-southeast-1).
2. Done 13 Nov: migration pasted into the SQL Editor and run. (GitHub auto-deploy needs Pro; `supabase db push` with a **scoped** token is the free CLI alternative.)
3. Done 13 Nov: Security and Performance advisors run. Open: Supabase's own `public.rls_auto_enable()` is executable by anon/authenticated (revoke after confirming auto-RLS still works); INFO notes about unindexed composite foreign keys (add indexes once there is real data).
4. Dashboard → Auth:
   - turn email confirmation on;
   - set the site URL and redirect URLs to the deployed domain only;
   - leave anonymous sign-ins off;
   - set password rules to match `config.toml`.
5. Data API settings: confirm only `public` is exposed. Our explicit grants decide access.
6. Put the URL and **publishable** key in `.env.local` / the host's env. Put the secret key on the server only.
7. Write `SupabaseLearnerStore` (`src/lib/learner/store.ts`) and the parent sign-in. Add tests against a local Supabase (`supabase start`).

## Not yet designed
- Assignment uploads (Stage F): a private Storage bucket with paths `{parent_id}/{learner_id}/…`, owner-only storage policies, file type and size limits, and malware/scan considerations.
- Learner summaries for the Claude brain's context (Stage B/E).
- Consent records (before real children).

## Consent table (13 Nov, committed, NOT applied live)
`20261113083000_parental_consent.sql` adds `public.parental_consents` (parent_id, consent_text_version, accepted_at, withdrawn_at). Owner-only RLS; insert + select + update(withdrawn_at) only for `authenticated`; timestamps forced by triggers (`private.force_accepted_at`, `private.guard_consent_update`, both SECURITY INVOKER); unique active row per parent per version. Apply after `20261113071456_learners_allow_kindergarten.sql`. Tested in `tests/db/consent.test.ts` and 10 mutants in `npm run mutate`.

## Learner interests and name_say (23 Nov, committed, NOT applied live)
`20261123064826_learner_interests_name_say.sql` adds `learners.interests text[] not null default '{}'` (CHECK: one-dimensional, at most 5, every item in the fixed list, no duplicates, checked pairwise without a function) and `learners.name_say text` (nullable; CHECK length 1..40 and `^[A-Za-z][A-Za-z '-]*$`). The column-scoped UPDATE grant gains exactly these two columns; RLS and policies are unchanged. Apply after `20261113083000_parental_consent.sql`: the founder pastes it into the SQL Editor, then verify with the connector (`list_tables`). The app's parent page selects both columns, so until it is applied the parent page shows the generic "not ready" state. Keep the id list in step with `src/lib/learner/interests.ts` (`tests/interests.test.ts` compares them). Tested in `tests/db/interests.test.ts` plus 10 mutants in `npm run mutate`.

## Billing (23 Nov 2026, committed, NOT applied live)
`20261123120000_billing.sql` adds `subscriptions` (PK `email_norm`; plan solo|family; status trialing|active|past_due|canceled|refunded; period_end), `billing_events` (webhook ids already handled) and `billing_usage` (turns per `(email_norm, period_end)`). All three: RLS on, no policy and no grant for `anon`/`authenticated`. A dedicated role `billing_writer` (nologin until the founder sets a password out of band; no BYPASSRLS) gets insert/select plus column-limited updates; no deletes. The app connects as it with `BILLING_DATABASE_URL`, so the "no service_role key in the app" rule holds. To apply: run the file in the SQL Editor (or the connector), then `alter role billing_writer login password '<long random>'` OUTSIDE the repo, and build the pooler connection string (Supabase dashboard → Connect → transaction pooler, with the user name `billing_writer.<project-ref>` and the new password) into Vercel as `BILLING_DATABASE_URL`. Tested in `tests/db/billing.test.ts` plus 17 mutants.

## Product events (24 Nov 2026, committed, NOT applied live)
`20261123210909_app_events.sql` adds `public.app_events` (id identity, created_at, `day` = Manila date generated from created_at, `code` from a fixed list of 8, `parent_id` uuid, three `utm_*` tags and `referrer_host` held by CHECKs). Error codes must have no parent id; every other code must have one. Unique indexes dedupe `signup` and `consent_given` per parent and `active_day` per parent per day. RLS on; no grant for `anon`/`authenticated`; `billing_writer` gets insert + select only. `checkout_clicked` is also unique per parent per day. The write caps are in the app's INSERT (`src/lib/events/cap.ts`): an hourly cap per code, 1,000,000 rows in total by `count(*)`. Note: `ON CONFLICT DO NOTHING` still consumes an identity value for the row it refused, so the INSERT first checks for the repeat itself (no id burned in the normal case; only a true race burns one). The id column is never used for a cap. (The migration was edited in place before it was ever applied.) Apply after `20261123150000_billing_stats_feedback.sql`: paste into the SQL Editor, then verify with the connector (`list_tables`, `get_advisors`). Until it is applied, /admin shows "Not set up yet" for the new panels and every event write quietly does nothing useful (errors are swallowed). Delete one family's events by hand: `delete from public.app_events where parent_id = '<uuid>'`. Tested in `tests/db/appEvents.test.ts` plus 19 migration mutants and 8 `cap:` mutants in `npm run mutate`.
