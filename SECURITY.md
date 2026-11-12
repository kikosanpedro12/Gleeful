# Security and privacy

A product for children. Rule: **least data, least privilege, nothing trusted from the browser.**

## What we store (and don't)
| Data | Where | Why |
|---|---|---|
| Parent email + password (hashed by Supabase Auth) | Supabase Auth | Account (Stage E) |
| Learner nickname, grade, language, teacher choice | `public.learners` | Teaching |
| Lesson sessions (teacher, worlds visited, times) | `public.lesson_sessions` | Continuity |
| Attempts (skill id, question id, answer id, correct, hints, context) | `public.attempts` | Honest progress |
| Daily brain usage (turns, tokens) | `public.brain_usage` | Spend limits |

**Never stored:** audio, free text typed or said by the child, birth date, surname, school, photos, location.

Today (before Stage E), attempts live only in the browser's localStorage. The parent view says so.

## Trust boundaries
- **Browser = untrusted.** Anything a child, a browser extension, or a modified client sends can be forged.
- **The brain's output = untrusted.** That covers the scripted brain now and a model later.
  - It can only trigger whitelisted commands with ids the current world declares (`src/lib/scene/commands.ts`).
  - Text is plain, sanitised, length-capped and rendered as React text or canvas, never as HTML.
  - No `eval`, no model-written code, no remote asset URLs.
- **Uploaded files and retrieved web pages (Stage F) = untrusted data, never instructions.**
- **Database = the enforcement point.** Row-level security on every table, verified by tests.

## Controls in place
| Control | Where | Verified by |
|---|---|---|
| Strict CSP with a per-request nonce; no `unsafe-inline` scripts, no `unsafe-eval` in production | `src/proxy.ts` | Browser journey runs with zero CSP violations |
| Security headers: nosniff, frame DENY, no-referrer, COOP/CORP, HSTS, Permissions-Policy (mic = this site only; camera, location, payment = none) | `next.config.mjs` | `curl -I` |
| RLS on every table: parents only see and change their own family | `supabase/migrations/` | `tests/db/rls.test.ts` (real Postgres) |
| Tenant-safe composite foreign keys (a child's data can't be attached to another family's child or session) | migration | same |
| Evidence is append-only for clients; the database sets timestamps (no back-dating) | migration | same |
| Server-only tables (`brain_usage`): no client write grants | migration | same |
| No `SECURITY DEFINER` functions; private schema not exposed | migration | same |
| Security tests must catch 8 planted holes | `scripts/mutate-rls.mjs` | CI |
| Auth config: email confirmation on, password ≥10 with mixed case + digits, secure password change, refresh token rotation, anonymous sign-in off, GraphQL not exposed | `supabase/config.toml` | Review |
| No secrets in the repo; no secret behind a `NEXT_PUBLIC_` name | `scripts/check-secrets.mjs` | CI |
| Pinned dependencies, exact lockfile, `npm ci --ignore-scripts`, audit, Dependabot | `package.json`, `.npmrc`, CI | CI |
| Test hooks only with `?test=1` / `?dev=1` | `src/components/scene/shared.tsx` | Review |
| Input caps (typed text 500 chars, board 60, choice labels 48) | controller, commands | Unit tests |

## Keys
- `NEXT_PUBLIC_*` values ship to every browser. Only the Supabase URL and the **publishable** key go there. They are safe only because of RLS.
- `SUPABASE_SECRET_KEY` and `ANTHROPIC_API_KEY` are **server only**: route handlers, never a client component.
- Keys live in `.env.local` (git-ignored) and in the host's encrypted env settings, never in code.
- Supabase CLI / MCP: use a **scoped** personal access token, not a full-account one.

## Before Stage B (Claude brain)
- [ ] `/api/brain` route: key server-side, signed-in parent required, learner ownership checked server-side
- [ ] Per-learner daily turn cap + per-lesson time cap **enforced on the server** via `brain_usage`; monthly spend limit in the Claude Console
- [ ] System prompt: child-safety rules, no personal data collection, uncertainty allowed, untrusted-content rule
- [ ] Rate limit per IP and per account

## Before any real child uses it (not started)
- [ ] Verifiable parental consent flow and privacy notice (COPPA, GDPR-K, and the Philippine Data Privacy Act).
- [ ] Data retention schedule and export.
- [ ] Review of the speech recognition and voice vendor terms for child-directed use.
- [ ] Content safety test set (inappropriate requests, personal info, distress) passed by the brain.
- [ ] Incident response contact and breach process.
- [ ] Independent security review of the deployed app.

## Reporting
Private project. Report issues to the founder directly; do not open public issues with details.
