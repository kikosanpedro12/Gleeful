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

**Never stored by us:** audio, free text typed or said by the child, birth date, surname, school, photos, location.

**Leaves the device without us storing it:** when the child taps the mic, the browser's speech recognition sends the audio to the browser vendor (Google for Chrome, Microsoft for Edge, Apple for Safari) to turn it into text. The start screen says so. Review this before real children use it.

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
| Evidence is append-only for clients; the database sets timestamps | migration | same |
| Column-scoped updates: parents can rename a child or end a session, never rewrite ids, ownership or timestamps | migration | same |
| Identity sequence has no API-role grants (no `setval` / counting other families' rows) | migration | same |
| Server-only tables (`brain_usage`): no client write grants | migration | same |
| No `SECURITY DEFINER` functions; private schema not exposed | migration | same |
| Security tests must catch 15 planted holes | `scripts/mutate-rls.mjs` | CI |
| Auth settings (email confirmation, password ≥10 with mixed case + digits, secure password change, refresh rotation, anonymous sign-in off, only `public` exposed, Realtime/S3/vector off) | `supabase/config.toml` (**local stack only**). The hosted project must be set to match in the dashboard; see docs/DATABASE.md. | Checklist |
| No secrets in the repo; no secret behind a `NEXT_PUBLIC_` name | `scripts/check-secrets.mjs` | CI |
| Pinned dependencies, exact lockfile, `npm ci --ignore-scripts`, audit, Dependabot | `package.json`, `.npmrc`, CI | CI |
| Test hooks need a test build (`NEXT_PUBLIC_TEST_HOOKS=1`, never set for deployment) and `?test=1` | `src/components/scene/shared.tsx` | Review |
| Input caps (typed text 500 chars, board 60, choice labels 48) | controller, commands | Unit tests |
| Crawlers: `/api`, `/parent`, `/tester` disallowed in robots.txt and sent `X-Robots-Tag: noindex`; whole site noindex until `SITE_INDEXING=on`; sitemap lists public pages only; no child data or session ids in URLs | `src/lib/seo/site.ts`, `next.config.mjs` | `tests/seo.test.ts`, /security-check step 7 |
| JSON-LD is the only `dangerouslySetInnerHTML`: server-built constants, `<`, `>`, `&` escaped so it cannot close its tag; carries the CSP nonce | `src/lib/seo/JsonLd.tsx` | `tests/seo.test.ts`, /security-check grep |

## Keys
- `NEXT_PUBLIC_*` values ship to every browser. Only the Supabase URL and the **publishable** key go there. They are safe only because of RLS.
- `SUPABASE_SECRET_KEY` and `ANTHROPIC_API_KEY` are **server only**: route handlers, never a client component.
- Keys live in `.env.local` (git-ignored) and in the host's encrypted env settings, never in code.
- Supabase CLI / MCP: use a **scoped** personal access token, not a full-account one.

## Known limits (honest)
- Until the server writes attempts (Stage B), an attempt's `context` (taught / recheck / later_check) is asserted by the parent's own device. It can only affect that family's own report, never anyone else's.
- The session time limit is enforced in the browser only. Server enforcement comes with the Claude brain.
- GitHub Actions are pinned to major versions. Pin them to commit SHAs once the repo exists.

## Stage B (Claude brain): status, 13 Nov
Built and tested against a **mocked** API (tests/brainServer.test.ts, tests/claudeBrain.test.ts). Never run against the real API yet.
- [x] `/api/brain`: key read server-side only (`import "server-only"`; the client bundle has no Anthropic URL), kill switch `BRAIN_DISABLED`, missing key → 503 → the script answers
- [x] `GET /api/brain` returns only `{configured:boolean}` (no secrets, never cached) so a build with no key skips the POST instead of logging a 503 on every page load; the 503 fallback still covers races. It does tell a visitor whether a key is set, which is not sensitive.
- [x] Same-origin only (Origin and Sec-Fetch-Site), JSON only, request fields validated, nothing echoed back. Body cap is 16 KB counted in **bytes**, read as a stream (a chunked body is cut off early) with a 5 s read limit. **Decision:** a request with neither Origin nor Sec-Fetch-Site (curl, a script) is allowed: browsers always send one, and a script can forge either, so this check is CSRF protection for browsers and is not a spend control. Spend is bounded by the limits below.
- [x] Model output untrusted: speech, **board text and choice labels** all stripped of tags, links and markdown (schemes, `www.`, ~90 domain endings with or without a path, scheme-less `host/path`, bare IPv4 addresses, e-mail addresses, "name dot com"); at most one question or choice set per reply is enforced in code (extras dropped); tool calls pass `parseSceneCommand` for the current world; simulation notice enforced in code. Output moderation still relies on the system prompt plus these filters; there is no separate moderation model yet.
- [x] System prompt: AI identity, no personal data, no medical/legal advice, hand off to a grown-up, off-topic redirect, child text only inside `<child_said>` and browser-supplied earlier teacher lines only inside `<earlier_teacher_line>` (both with angle brackets removed, both declared "data, not instructions"); prompt-injection tests
- [x] Limits: 400 output tokens, `maxDuration` 20 s, per-IP 30/min, per-session 20/min and 200 total, 400 turns per learner per day in the family's time zone (zone pinned on first sight), 1500 turns per client address per day, 5000 turns per day overall.
- [x] **Sonnet cannot be forced.** It is used only for a reasoning question (why / how come / how does / explain / what if) of 120+ characters, or a wrong answer (checked against the world's own question data on the server) after a hint. Length alone or a client-sent `hintsUsed` alone never escalates. Even then it needs budget in all three: 20 per learner, **40 per client address** (learnerId is browser-chosen, so rotating it does not help) and **300 per deployment** per day. Over budget → Haiku answers.
- [x] **The in-memory tables fail closed.** When a table is full, expired entries are purged; if it is still full a NEW learner, address or session is refused with 503, and no live entry is ever evicted. (Evicting would let someone reset a victim's counters by sending fresh ids.) Cost: a flood of fresh ids can temporarily lock out brand-new clients; existing ones carry on, and the Console limit still caps spend.
- [x] The deployment-wide and per-address counters use the **UTC** day on purpose: the browser picks its own time zone, so a zone-based day would let a client move the boundary of a limit that is meant to bind it. Only the per-learner family limit uses the family's zone (pinned).
- [x] The model call and reading its response share one 12 s timer.
- [x] Child speech and model replies are never logged (a test spies on the console)
- [x] **Private-test passcode** (`BRAIN_TESTER_CODE`, 13 Nov). When set, every POST to `/api/brain` must carry it in the `x-gleeful-tester` header, checked with a constant-time compare of SHA-256 hashes, after the per-IP rate limit and before the body is read or anything is spent; otherwise 403 `tester_required` and the lesson falls back to the script. Testers type it once on `/tester`; it lives in that tab's `sessionStorage` only, is never echoed back, and a wrong code is forgotten so the page asks again. `GET /api/brain` also reports `testerRequired` (one boolean), so a browser without the code never POSTs. A `BRAIN_TESTER_CODE` shorter than 16 characters is treated as a misconfiguration: the server logs one warning (never the code), `GET /api/brain` reports `configured:false`, and every POST gets 503 before any model call, so the script answers (fails closed rather than running a guessable gate). On screen, AI wording follows what the visitor can reach (key + gate + code), not the build flag (`src/lib/brain/reach.ts`, `tests/honesty.test.ts`). Tests: `tests/tester.test.ts`. This makes a real key on the public Vercel URL safe enough **for a private test with people who have the code**. It is not sign-in: anyone with the code shares one budget, and the code can leak, so rotate it when a tester leaves and keep the Console limit low.
- [ ] **OPEN LAUNCH BLOCKER: rotation bypass.** Mitigated for the private test by the passcode above (without the code nothing reaches the model); still a launch blocker, because a code holder can still rotate ids. Proven by a test (`tests/brainAttack.test.ts`, skipped on purpose): rotating the forwarded address, `sessionId` and `learnerId` on every request gets every call through (150 of 150 in the test); only the 5000/day deployment cap and the Console spend limit stop it. It cannot be fixed without parent sign-in plus limits in `brain_usage`. **No public traffic until both exist. The Console spend limit is the only hard ceiling.**
- [ ] **Signed-in parent required and learner ownership checked server-side.** NOT done: there is no sign-in yet. Until then `learnerId` and `sessionId` are chosen by the client, so per-learner and per-session limits bind honest clients only; per-IP, the global cap and the Console spend limit bind everyone. **Do not give the deployed build a real key and public traffic until sign-in exists; for a phone test use a low Console limit and share the link with nobody.**
- [ ] The server writes attempts and decides `later_check` (evidence is still recorded in the browser)
- [ ] **Limits in `brain_usage` (shared across instances) instead of per-instance memory; use the secret key only for that table.** Until then EVERY cap above is per warm serverless instance and resets on a cold start, so the real ceiling is (instances × the cap). They are a brake, not a ceiling. **The Anthropic Console spend limit is the only real ceiling.** Keep it low until this is done.
- [ ] Per-lesson time cap enforced on the server
- [ ] Per-IP limit trusts the first `x-forwarded-for` value: correct on Vercel (it sets the header), spoofable elsewhere
- [ ] Concurrent requests can overshoot a daily cap by a few turns (in-memory counters)
- [ ] Anthropic API data handling and retention reviewed for child-directed use (before real children)

## Landing page (13 Nov)

- The landing page and /privacy are static and collect no personal data: no waitlist, no sign-up, no tracking form. The only server route is `/api/brain` (see above). The waitlist built earlier was removed before it was ever applied to the live database.
- Privacy contact email is a placeholder until Kiko supplies one.

## Before any real child uses it (not started)
- [ ] Verifiable parental consent flow and privacy notice (COPPA, GDPR-K, and the Philippine Data Privacy Act).
- [ ] Data retention schedule and export.
- [ ] Review of the speech recognition and voice vendor terms for child-directed use.
- [ ] Content safety test set (inappropriate requests, personal info, distress) passed by the brain.
- [ ] Incident response contact and breach process.
- [ ] Independent security review of the deployed app.

## Reporting
Private project. Report issues to the founder directly; do not open public issues with details.

## Parent sign-in (13 Nov)
- Session in cookies via @supabase/ssr; server code trusts only `getClaims/getUser`, never the client session. Only the publishable key is accepted (a secret/service_role key is rejected on purpose); the app has no use for one.
- `next` redirect param passes `safeNext()` (own pages only). Callback failures all look identical (no account enumeration). No emails or tokens in logs.
- Sign-in attempts have a per-address in-memory brake: a brake only (per warm instance); Supabase's own Auth rate limits are the ceiling.
- `/api/brain` spending requires a signed-in parent WITH consent on file, or the tester passcode. Budgets are per auth user id, per address and per deployment, and fail closed when a table is full. Rotating IPs no longer bypasses the cap.
- Consent is a versioned record (`parental_consents`): owner-only RLS, database-set timestamps, withdraw-only for clients, no deletes, one active row per version, no SECURITY DEFINER. 28 mutation-test mutants cover it.
- Not done: a lawyer must confirm the consent wording and flow (COPPA / PH Data Privacy Act) before real children use it.

## Anonymous landing taste: `/api/taste` (13 Nov)
- Separate from `/api/brain` on purpose; no shared budgets, no shared code path to the lesson. It accepts no tester code and reads no cookies, so a passcode or session grants nothing here.
- Cannot reach Sonnet or tools: the model is the constant `MODELS.default`; the upstream request carries no `tools`/`tool_choice`; `max_tokens` is 150. Request fields `model`, `tools`, `system`, `max_tokens` are ignored (tested).
- Input: same-origin browsers only, JSON only, 2 KB body, 3 s read timeout. The question is stripped of control characters and angle brackets (so it can never close a prompt tag), capped at 140 characters; history lines get the same treatment and are labelled as data.
- Output: only `text` blocks are used (a `tool_use` block is ignored), links and markup are stripped by the lesson sanitizer, at most 2 parts and 280 characters. A reply with nothing usable is an error, never a made-up answer.
- Caps (all fail closed, bounded tables, never evict live keys): 3 per page view, per-address daily (default 9), site-wide daily (default 600), 6 per minute per address. The page-view id is browser-chosen, so rotating it buys nothing; the per-address and site-wide caps bind. `GET` never writes a counter.
- HONEST LIMIT: counters are per warm server instance (a brake). The Anthropic Console monthly spend limit is the ceiling. Behind a shared proxy or NAT many people share one address, and a spoofed `x-forwarded-for` can pick another bucket when the host does not overwrite it; the site-wide cap and the Console limit are what bind then.
- Logs carry error kinds and status codes only; what the visitor typed and what the model said are never logged (tested). The visitor's address is held in memory for the day and not stored. The privacy notice says so.
- Not yet done: a child-safety test set run against the REAL model for this prompt, and a lawyer's view on whether an open box that an under-13 can type into needs the parental-consent flow (the copy asks for a parent or older child and warns against private details, but that is not a legal control).

## Widgets and voice lab (14 Nov)
- New wire input `widget` (number line / fraction bars): value and optional target are parsed by `parseValue` (numbers and fractions only, bounded), refused during transit. The `target` is **client-asserted**: the prompt says "the app reports this matches", and a widget input never records evidence, escalates the model or spends extra (test in `tests/widgets.test.ts`). A tampered client can only get a wrong "that's right" for itself.
- `showWidget`/`hideWidget` are validated commands (bounded specs, no strings, one per reply); the spec is validated again server-side. CSP unchanged.
- `/voice-lab` is a private route (noindex, in PRIVATE_PREFIXES, llms.txt and layout metadata). It has no passcode: it serves only 20 bundled Kokoro sample clips and sends nothing.
- Honesty filter: the code-side "no re-intro" strip applies only to teacher-started lines (transit, world ready, resume), so a child asking "are you a robot?" always gets the AI answer (tests in `tests/uxRound.test.ts`).
