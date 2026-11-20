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
- [x] System prompt: AI identity, no personal data, no medical/legal advice, hand off to a grown-up, answers any genuine learning question but redirects non-learning chat/role-play and points sensitive topics to a trusted grown-up (safety rules win), child text only inside `<child_said>` and browser-supplied earlier teacher lines only inside `<earlier_teacher_line>` (both with angle brackets removed, both declared "data, not instructions"); prompt-injection tests
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
- Separate from `/api/brain` on purpose; no shared budgets, no shared code path to the lesson. It accepts no tester code and reads only its own signed `gl_taste` cookie (HMAC-SHA256, httpOnly, Secure, Path=/api/taste, no personal data; holds only the tries used). Cookie secret: `TASTE_COOKIE_SECRET`, falling back to a key derived from the API key. It is a brake, not a limit: clearing cookies gives a new count; the per-address, global and Console spend caps bound cost. A passcode or session grants nothing here.
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
- `/voice-lab` is a private route (noindex, in PRIVATE_PREFIXES, llms.txt and layout metadata). The page itself has no passcode and saves nothing of the listener's ratings; the Kokoro clips are bundled static files. The Deepgram slots send the five sample lines to Deepgram through the passcode-gated /api/tts, and the ElevenLabs slot sends them to ElevenLabs through the passcode-gated /api/voice.
- Honesty filter: the code-side "no re-intro" strip applies only to teacher-started lines (transit, world ready, resume), so a child asking "are you a robot?" always gets the AI answer (tests in `tests/uxRound.test.ts`).

## Text-to-speech route `/api/tts` (14 Nov)
- Deepgram Aura-2 behind a server route; `DEEPGRAM_API_KEY` is server-only (`import "server-only"`), never `NEXT_PUBLIC_*`. Closed by default: needs the private-test passcode (`BRAIN_TESTER_CODE`, 16+ chars, same gate as /api/brain) and a key; otherwise 503.
- Order: same-origin check → config → per-address rate limit (20/min, before the passcode so guesses are limited) → passcode → body (2 KB cap, 3 s) → voice must be in the allowlist (`src/lib/tts/voices.ts`) and text ≤ 300 chars → daily character ceiling (default 60,000, hard cap 300,000, per warm instance) → upstream call (10 s, 2 MB cap).
- The browser cannot choose the model, endpoint or encoding. Text is never logged. Real ceiling: Deepgram's prepaid credit (free $200, no card on file); keep no card until launch.
- Tests: `tests/tts.test.ts`.

## Text-to-speech route `/api/voice` (ElevenLabs, 16 Nov)
- `ELEVENLABS_API_KEY` is server-only (`import "server-only"`), sent only to api.elevenlabs.io, never `NEXT_PUBLIC_*` (`check-secrets` flags any public-prefixed ElevenLabs variable). Closed by default: key + `BRAIN_TESTER_CODE` (16+ chars) + not `TTS_DISABLED`; otherwise 503.
- Order: same-origin → config → per-address rate limit (20/min) → passcode → body (2 KB, 3 s) → teacher allowlist (`leo`/`mia`) and text ≤ 300 chars → daily characters (default 30,000, hard cap 100,000, per warm instance) → streamed upstream call (10 s headers, 18 s total, 3 MB audio cap).
- The browser sends only `teacher` and `text`. Voice id, model (allowlist), format and endpoint are server-side. Text is never logged. Refund only on a clean upstream refusal.
- Real ceiling: the credit cap on the ElevenLabs key (30,000) plus 90-day expiry. Key scope: Text to Speech + Voices Read only.
- Open: ElevenLabs keeps generation history by default. Review retention and age terms before any child's words or model replies go through it (see the voice-vendor line in the checklist above). Private tests send fixed sample lines only.
- Lesson use: a tester (passcode in this tab) hears the tutor's lines in ElevenLabs; the line text (tutor lines only; the child's own speech is never sent, but a model reply can paraphrase what the child said) goes to ElevenLabs. Any refusal or error switches it off for the visit and the browser voice takes over. NOT for real children until the retention/age review above is done.
- Tests: `tests/voiceEleven.test.ts`, `tests/elevenPlayer.test.ts`, `tests/elevenSpeak.test.ts`.

## Per-tester invite codes (18 Nov)
- `TESTER_INVITES="name:code,..."` (server-only). Each invite is its own budget owner (`tester:<name>`) in the brain's per-owner daily ceilings, and its own character bucket in `/api/voice` (`ELEVEN_TESTER_DAILY_CHARS`, default 6,000, hard cap 20,000). The master `BRAIN_TESTER_CODE` is one more tester (`tester`). Whole-site ceilings still apply on top.
- Codes are compared in constant time against every invite (no early exit). A malformed, short, duplicate or over-50th entry is skipped. Revoke by removing the entry and redeploying. Tester buckets are capped at 100 in memory and fail closed.
- Per-instance counters again: the real ceilings are the ElevenLabs key credit cap and the Anthropic Console limit.
- All testers (master + invites) also share one class budget (`tester*`) with the same per-owner ceilings, so adding invites never raises the tester total (1,200 turns, 60 Sonnet per day per warm instance). Each invite also has its own ceilings under that.
- A master code shorter than 16 characters switches off the brain AND all invites (fail closed). Skipped invite entries log one warning with a count only. An invite equal to the master code is dropped. /api/tts (Deepgram, lab only) accepts only the master code.
- Known: any code holder can rotate learner ids to fill the 5,000-key table on one instance (503 for everyone until the day rolls). Bounded and authenticated; unchanged in kind.
- Tests: `tests/invites.test.ts`.

## Vendor findings and story scenes (19 Nov 2026)
- **Anthropic API (brain):** no training on customer content by default, retention under 30 days, must disclose it is an AI (the UI does), recommends age checks, moderation and COPPA care. Parent sign-in plus consent gates it; per-parent daily caps apply.
- **ElevenLabs (voice):** its terms say the service is not for under-18s, it may use inputs and outputs for training unless opted out, and Zero Retention is Enterprise-only. Founder decision (19 Nov): give the landing taste, the demo lesson and consenting parents the ElevenLabs voice, and top up credit as needed. It is behind `ELEVEN_PUBLIC=on` (off by default). Only the tutor's spoken line is sent (never the child's name, speech or account); anonymous visitors get `ELEVEN_ANON_IP_CHARS` (700/day) each from a shared `ELEVEN_ANON_POOL_CHARS` (6,000/day) pool, consenting parents `ELEVEN_PARENT_CHARS` (3,000/day), all inside the site ceiling and the key's credit cap. The counters are per warm server instance, so the credit cap on the ElevenLabs key is the ONLY real ceiling: it must be set before `ELEVEN_PUBLIC=on` (go-live precondition). A crowd can use up the anonymous pool for the day (availability, not spend); anonymous addresses have their own bounded table, so they cannot lock out testers or parents. Founder steps before switching on: opt out of training in the ElevenLabs account settings, set the key's credit cap, then set `ELEVEN_PUBLIC=on` in Vercel. Open: ElevenLabs' under-18 terms (the audio is tutor speech; lawyer to confirm).
- **`showScene` / `hideScene`:** the model sends a setting id, a short caption and prop ids from `src/lib/assets/manifest.ts`; nothing else. Layout is fixed in code. Real people appear only as credited public-domain pictures from `src/lib/assets/figures.ts` (empty for now). One scene per reply; caption is moderated like speech; always labelled "pretend". A failed load shows a text fallback (error boundary). Second WebGL canvas, mounted only while a scene is shown; per-asset cap 1,500 KB, per-scene cap 3,000 KB.
- **`graph` widget:** display only; validated numbers (window -20..20, up to 6 points, 2 lines); point labels stripped to letters, digits and basic punctuation and moderated.
