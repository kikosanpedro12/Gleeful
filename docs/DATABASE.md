# Database (Supabase) — project `gleeful` created 13 Nov 2026, linked to GitHub; the migration deploys from `main`

Migration: `supabase/migrations/20261112051808_init_learning_schema.sql`. Local config: `supabase/config.toml`.

## Tables
| Table | Rows | Who can do what |
|---|---|---|
| `learners` | One per child: nickname, grade 1–12, language, preferred teacher | Parent: read, add, edit, delete their own |
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
1. Create the Supabase project in a region near the users, and set a strong database password in a password manager.
2. Link the project with a **scoped** access token, then run `supabase db push`.
3. Run the Security Advisor and Performance Advisor (`supabase db advisors`, or the MCP `get_advisors`). Fix everything they flag.
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
