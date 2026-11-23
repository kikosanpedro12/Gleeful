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
- [ ] **Lawyer: the landing mic and a child's own voice.** The browser's speech service (Google, Microsoft or Apple) receives a child's voice when they tap the mic on the landing (no sign-in, no parental consent step). Confirm whether that needs parental consent (COPPA, GDPR-K, PH Data Privacy Act) or should be gated; the notice and `/privacy` must name it. The `/learn` mic has the same question.
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

## Learner interests and name respelling (23 Nov, parent area only)
- A parent can store up to 5 interests from a fixed list of 17 ids and an optional respelling of the child's name. Neither is ever free text from a child. The server rejects any id not in `src/lib/learner/interests.ts` (Set lookup, no object keys), duplicates and a sixth; the database repeats every rule in CHECK constraints (no function, no SECURITY DEFINER). The respelling is ASCII letters, spaces, hyphens, apostrophes, 1-40 characters, so no markup, digits or links can be stored.
- Only the owning parent can read or write them (existing RLS; update grant extended by exactly these two columns). Tests: `tests/db/interests.test.ts`, `tests/interests.test.ts`; 10 mutants.
- Consent wording bumped to `2026-11-23.v1` to cover them honestly; existing parents are asked again (the parent page and `/api/brain` only count consent for the current version). Saving interests or a respelling needs consent for the current version. Privacy notice updated and dated 23 November 2026. Nothing child-facing reads these yet; when the tutor uses them, they may go into a prompt only as ids/labels from the list and the respelling only for the voice. Not done: lawyer review of the new wording.
- Migration NOT applied live.

## Anonymous landing taste: `/api/taste` (13 Nov)
- Separate from `/api/brain` on purpose; no shared budgets, no shared code path to the lesson. It accepts no tester code and reads only its own signed `gl_taste` cookie (HMAC-SHA256, httpOnly, Secure, Path=/api/taste, no personal data; holds only the tries used). Cookie secret: `TASTE_COOKIE_SECRET`, falling back to a key derived from the API key. It is a brake, not a limit: clearing cookies gives a new count; the per-address, global and Console spend caps bound cost. A passcode or session grants nothing here.
- Cannot reach Sonnet or tools: the model is the constant `MODELS.default`; the upstream request carries no `tools`/`tool_choice`; `max_tokens` is 600 (thinking plus the reply; the visible reply is still capped at 280 characters). Request fields `model`, `tools`, `system`, `max_tokens` are ignored (tested).
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

## Landing taste: voice, mic, acting, guided arc (21 Nov 2026)
- **ElevenLabs on the landing (founder decision 21 Nov).** Through `/api/voice` and all its guards (same-origin, 2 KB body, 300-char text, per-address 20/min, teacher allow-list, server-held voice ids and model, refund only on a clean upstream refusal, text never logged). Its own pool: `x-gleeful-voice: landing` → principal `anon:<ip>` (same per-address daily bucket as ELEVEN_PUBLIC, `ELEVEN_ANON_IP_CHARS`) plus ONE shared `landing-pool` of at most **5,000 characters a day** (`ELEVEN_LANDING_DAILY_CHARS` can lower it, never raise it), separate from the `anon-pool`, inside the site ceiling. On whenever a key is set; `ELEVEN_LANDING=off` closes it. Pool used up, no key, refusal or error → the browser voice speaks, silently, and ElevenLabs stays off for that visit. Per warm instance again: the key's credit cap is the real ceiling, and the account's training opt-out still applies (Kiko only). Tests: `tests/voiceLanding.test.ts`.
- **Grown-up gate in front of voice (22 Nov):** the landing mic and spoken replies (ElevenLabs and browser voice) stay off until a grown-up taps "Yes, a grown-up is here" (`src/lib/taste/grownUp.ts`). It is a light check, NOT age verification or parental consent: a child can tap Yes. Before it: no mic/SpeechRecognition call, no `/api/voice` request (the probe waits too), no speech synthesis. State: React state + `sessionStorage` in try/catch, exact value `yes` only (survives a reload in the same tab until the tab is closed, so a different child on that tab would get voice without a tap; open decision in BACKLOG); never localStorage, cookie or server. CSP unchanged. Tests: `tests/grownUpGate.test.ts`, landing-smoke 5d/5e, taste-break2 M, landing-a11y 1b. `/learn` is not covered.
- **Mic on the landing:** the same browser recogniser as the lesson (`listenOnce`); shown only where the browser has one; the card says the browser sends the voice to Google, Microsoft or Apple and we only get the text. A spoken question is the same request as a typed one (same caps, same try count); audio never reaches us.
- **ACT / CHOICES / TOPIC lines** from the taste model: ACT must pass `parseSceneCommand("act")` for the classroom world (server and browser); CHOICES must be 1–2 plain phrases of ≤32 characters (all or nothing: too many, duplicates, links, markup, handles, numbers, unsafe words = none), dropped in code on the last try; TOPIC ≤32 plain characters. All pass the lesson sanitizer and moderation; a redirected reply carries none. Rendered as React text only. Tests: `tests/tasteArc.test.ts`.
- **Prompt:** the tutor's name is in the system prompt (the name in the user turn made the model deny being "a real person named Leo"); AI disclosure only when asked; safety rules first; hooks are curiosity only (no pressure, urgency, streaks, or talk of paying). Not yet run against the real model.

## Vendor findings and story scenes (19 Nov 2026)
- **Anthropic API (brain):** no training on customer content by default, retention under 30 days, must disclose it is an AI (the UI does), recommends age checks, moderation and COPPA care. Parent sign-in plus consent gates it; per-parent daily caps apply.
- **ElevenLabs (voice):** its terms say the service is not for under-18s, it may use inputs and outputs for training unless opted out, and Zero Retention is Enterprise-only. Founder decision (19 Nov): give the landing taste, the demo lesson and consenting parents the ElevenLabs voice, and top up credit as needed. It is behind `ELEVEN_PUBLIC=on` (off by default). Only the tutor's spoken line is sent (never the child's name, speech or account); anonymous visitors get `ELEVEN_ANON_IP_CHARS` (700/day) each from a shared `ELEVEN_ANON_POOL_CHARS` (6,000/day) pool, consenting parents `ELEVEN_PARENT_CHARS` (3,000/day), all inside the site ceiling and the key's credit cap. The counters are per warm server instance, so the credit cap on the ElevenLabs key is the ONLY real ceiling: it must be set before `ELEVEN_PUBLIC=on` (go-live precondition). A crowd can use up the anonymous pool for the day (availability, not spend); anonymous addresses have their own bounded table, so they cannot lock out testers or parents. Founder steps before switching on: opt out of training in the ElevenLabs account settings, set the key's credit cap, then set `ELEVEN_PUBLIC=on` in Vercel. Open: ElevenLabs' under-18 terms (the audio is tutor speech; lawyer to confirm).
- **`showScene` / `hideScene`:** the model sends a setting id, a short caption and prop ids from `src/lib/assets/manifest.ts`; nothing else. Layout is fixed in code. Real people appear only as credited public-domain pictures from `src/lib/assets/figures.ts` (empty for now). One scene per reply; caption is moderated like speech; always labelled "pretend". A failed load shows a text fallback (error boundary). Second WebGL canvas, mounted only while a scene is shown; per-asset cap 1,500 KB, per-scene cap 3,000 KB.
- **`graph` widget:** display only; validated numbers (window -20..20, up to 6 points, 2 lines); point labels stripped to letters, digits and basic punctuation and moderated.

## Admin page: `/admin` (22 Nov, read-only)

- **Hosted auth settings verified 22 Nov 2026 (dashboard, Gleeful project):** "Confirm email" is ON, anonymous sign-ins OFF, manual linking OFF. Re-check before relying on `ADMIN_EMAILS` after any auth settings change. An unverified-email claim never matches; prefer the user id in `ADMIN_EMAILS` once known.
- Founder only. Allowlist = server-only env `ADMIN_EMAILS` (comma list of sign-in emails and/or Supabase user ids; empty or unset = nobody; entries that are not a plain email or UUID are dropped, so no wildcards or domains). Checked in the server component (`src/lib/admin/guard.ts`, `import "server-only"`) from VERIFIED claims (`getClaims`), exact match on the lower-cased value; anonymous sessions and non-`authenticated` roles never match.
- Every refusal (accounts off, signed out, signed in but not listed, empty list, any error) ends in the same `notFound()`: no redirect to sign-in, no 403. Not named in llms.txt. Known small tell: it is Next's 404 rendered from a page, so a few meta tags differ from a truly missing route; the body shows nothing. It IS in robots.txt (Disallow) and carries `X-Robots-Tag: noindex`.
- Email matching trusts the email claim: keep Supabase email confirmation ON (config.toml has it; the hosted project must match) and prefer adding the user id once known. Sign-in: use /sign-in (magic link or password), then open /admin by hand (`safeNext` deliberately does not allow it). Google sign-in is being added by the founder separately (provider not configured yet).
- No write actions, no forms. Shows booleans and fixed labels only: kill switch states, key set yes/no, landing voice pool used/cap, counts of fixed server event codes. Never a key value, a code, an id, an address or any child text (`tests/admin.test.ts`, `tests/adminPage.test.ts`).
- No database change. Sign-ups, trials and per-family tables are NOT shown: they need the secret key or a reviewed count view, which the app does not have (listed on the page as "not tracked yet").
- Counters (voice pool, event counts) are per warm server instance and per UTC day: a brake and a hint, not accounting.

## Continue with Google: `/auth/google` (23 Nov 2026)
- A plain link (navigation), not a form post: the CSP `form-action` list would block the hop on to accounts.google.com, and the CSP is not loosened. Supabase Auth runs OAuth with Google (PKCE) and returns to `/auth/callback`, the same code exchange the emailed link uses.
- `redirectTo` is built from the configured site (`NEXT_PUBLIC_SITE_URL`), never from the request; `next` goes through `safeNext()`. Every failure redirects to `/sign-in?error=google` with one generic notice.
- Client ID and secret live only in Supabase (Auth, Providers, Google). Nothing in this repo. Requested scopes are the basics: email and profile. Only parents sign in; children never have accounts.
- Brake: 30 starts per 10 min per address, per warm instance (a brake, not a ceiling).
- NOT yet verified (23 Nov): a real login round trip, in particular that the PKCE code-verifier cookie survives the redirect (the emailed-link route uses the same cookie pattern and works). Check with a real sign-in before calling it done.

- Interests/name_say consent gate (23 Nov 2026): "saving needs current consent" is enforced in the server action only (`updateLearner`), like `addLearner`; RLS does not check consent, so a parent with their own JWT could write these two columns directly. They hold only fixed-list ids and a respelling, and nothing child-facing reads them yet. The array check also pins `array_lower = 1` (custom bounds like `[5:6]` skipped the duplicate checks); covered by a db test and a mutant.

## Billing: Freemius webhook, entitlement gate, usage (23 Nov 2026, built in TEST MODE; live charging NOT switched on)
- **Switch:** `PAYMENTS_MODE` = `off` (default, anything else) | `sandbox` | `live`. While `off`: the webhook answers 503, no billing check runs, behaviour is exactly the closed beta. `live` is the founder's decision after the go-live list in CHECKPOINT.md.
- **Webhook `/api/freemius/webhook`** (`src/lib/billing/webhook.ts`): 503 unless mode is on and `FREEMIUS_SECRET_KEY` (16+ chars, server-only) is set; 64 KB body cap; HMAC-SHA256 over the RAW bytes compared in constant time BEFORE the JSON is parsed; unknown or unreadable events are acknowledged and change nothing (an unknown event never grants access); a grant needs a known plan; a stop (cancel, refund, failed renewal) only changes a subscription that already exists; idempotent by event id (`billing_events` primary key); DB failure = 500 so Freemius retries safely. Nothing about the buyer is logged. **UNVERIFIED:** Freemius does not publish the body of each event; field names in `mapEvent` must be confirmed against a captured sandbox event before `live`.
- **Entitlement gate:** `/api/brain` and `/api/voice` need a signed-in, consented parent AND (when mode is on) a trial or plan with allowance left (`decide()` in `plans.ts`). 402 `subscription_required` / `allowance_used`; 503 `billing_unavailable` when billing cannot be read (fails CLOSED). Testers with a passcode are exempt. The on-screen "AI teacher" claim follows `entitled` (`reach.ts`). Result cached 30 s per warm instance.
- **Allowance** is counted in model turns (the server sees those) and shown as minutes at an ESTIMATED 2.7 turns/minute (`config/pricing.json`). It is a margin brake, not a stopwatch. Trial 120 min over 7 days; Solo 600; Family 2400 per period. The count is keyed by the period end, so a renewal starts a fresh count.
- **Storage, no service_role:** tables `subscriptions`, `billing_events`, `billing_usage` (migration `20261123120000_billing.sql`) have RLS on, no policy and no grant for `anon`/`authenticated`. Only the narrow `billing_writer` role can touch them: insert and column-limited update, no delete, no re-keying, sees no other table, no BYPASSRLS. The server connects as that role with `BILLING_DATABASE_URL` (server-only, `import "server-only"` in `store.ts`; its password is set outside the repo). Planted-hole tests: `tests/db/billing.test.ts` + 17 billing mutants in `npm run mutate`.
- **Matching a buyer to an account:** by the e-mail Freemius sends vs the signed-in parent's VERIFIED e-mail claim. A buyer who pays with a different e-mail will not be matched (the parent screen tells them to use the same e-mail). Known limit.
- **Checkout/portal links** come from server env (`FREEMIUS_CHECKOUT_URL_SOLO`, `_FAMILY`, `FREEMIUS_PORTAL_URL`) and are rendered only if they are https on a freemius.com host. Plain links: no new script or frame origin, so the CSP is unchanged.
- **Known limits:** usage increments are not atomic with the check (a brake, not a ceiling); entitlement can lag a webhook by up to 30 s; out-of-order webhooks are applied in arrival order.

### Feedback inbox and admin numbers (24 Nov 2026)
- `billing_writer` now also inserts and reads `feedback` (no update, no delete). Same credential as billing, so that credential can read all feedback messages and e-mails.
- Anonymous writes are capped in the database (100 an hour, 5000 total, 429 when refused), on top of the per-instance 5 per 10 minutes. The honeypot answers 200 and stores nothing. The feedback inserts share the single billing connection, so the caps also protect webhooks and entitlement lookups.
- Deleting a feedback message on request is done by hand in the Supabase SQL Editor (`delete from public.feedback where id = ...`). The privacy page says so.
- First events for one buyer are serialised with `pg_advisory_xact_lock` (FOR UPDATE on a missing row locks nothing), so the stats do not count one trial-to-paid as two things.
- Admin revenue is an estimate and includes sandbox/test purchases.
