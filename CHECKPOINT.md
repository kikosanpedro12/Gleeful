# Checkpoint — updated 2026-11-13

**Product name: Gleeful** (decided 13 Nov 2026). **Stage A (the scripted "wow" slice) is built and browser-tested.** **Stage B (Claude brain) is built and tested against a mocked API only** (13 Nov); Stage E (Supabase wiring) is not built. See BUILD_PLAN.md.

## Verified by running it
- **Onboarding:** pick Leo or Mia. Each waves and says hello in a male or female browser voice.
- **The trip:**
  - Classroom walls peel away, stars stream past, Mars grows, and a warm flash brings a landing on the Martian surface.
  - The teacher wears a helmet in space and on Mars. A "Simulation" label shows, and the teacher says people need spacesuits.
  - With reduced motion turned on, the trip is a short fade.
- **Teacher body:** walks, turns, points at the real position of each object (highlight ring), gestures, blinks and looks around. The mouth moves while speaking.
- **Lesson:**
  - "Why is it red?" makes the teacher walk to the rock and invite a tap. The child can pick the rock up and spin it, with a NASA-sourced card.
  - A question follows. A wrong answer gets a hint, not praise.
  - Crater and volcano stops, then back to class for a no-hint recheck.
- **Memory across sessions:**
  - In the next session (Mia this time, since history is kept when the teacher switches), the teacher opens with a no-hint check based on stored evidence.
  - The parent view (/parent) separates "during the lesson", "a few minutes later" and "a later session". Only the last counts as "did it on their own".
- **Interruptions:** Stop, tap-to-talk and typing stop speech, mouth, walking and pointing at once. Stale actions are dropped. A queued arrival line plays about 1.2 s after Stop and never over the child.
- **Fallbacks:** mic blocked or no speech, the browser voice failing (silent timeline keeps the pace), no WebGL (the trip still lands), End or Start mid-trip, tampered local storage.
- **Security:**
  - A strict per-request CSP nonce and security headers. The journey runs with zero CSP violations.
  - The Supabase schema's row-level security was attacked on real Postgres: 49 database tests, and 15 of 15 planted holes were caught. Reviewer pre-production pass on the migration (13 Nov): PASS WITH NOTES; the database now also sets `lesson_sessions.started_at`.
  - Secret scan, pinned dependencies, 0 known vulnerabilities.
- **Tests:** 264 unit/database tests (1 skipped on purpose: the rotation-bypass repro) including the Claude brain: route, limits, injection, sanitizer, client, fallback, badge. The browser journey passes on desktop and phone (390×844) and reduced motion, also in model mode with no key.
- **Stage B review round (13 Nov):** independent reviewer PASS WITH NOTES on a991c2e (fine for a private low-limit phone test, FAIL for public traffic). All 3 high and 4 medium findings and the low ones were fixed (Sonnet un-forceable with per-address and deployment budgets, fail-closed tables, `maxDuration`, link/board/choice sanitising, truthful badge, byte-capped timed body read, tagged history). Tester round: PASS WITH NOTES (key never in the client bundle; no-key fallback clean); its remaining items (email stripping, one question per reply, capability probe) were fixed in fc8593c. The rotation bypass stays an open launch blocker.

## Simulated or placeholder — do not mistake for the product
- **The Claude brain has never talked to the real API.** `/api/brain` + `ClaudeBrain` are tested with a mocked Anthropic. Default build is still the script; `NEXT_PUBLIC_BRAIN=model` opts in (falls back to the script on any failure; the badge then reads "AI teacher · test build"). A model-mode build with no key passed 32/33 journey checks (the one flag is Chrome logging the expected 503), and its badge reads "Scripted lesson · not AI yet" because the script answered.
- **The lesson is scripted, not AI.** Labelled "Scripted lesson · not AI yet". It understands keywords only, and says so for anything off-script.
- **Leo and Mia are procedural placeholders (founder is considering a mascot instead of human teachers)** built from primitives we own. They are not the concept-art quality: no skinned mesh, no facial morphs, no fingers.
- **The mouth follows a synthetic rhythm, not lip sync.** Voices are the device's built-in browser voices.
- **Learning history lives in this browser only.** The Supabase schema is live on the Gleeful project (empty, verified 13 Nov) but the app is not wired to it yet.
- The Mars terrain, globe and planet are illustrative and generated in code. They are not real maps.
- Mars facts: drafted from NASA Space Place, **pending human review**.

## Not verified yet
- Real Android phone (Honor X9b): fps, voices, speech recognition, touch.
- How the browser voices sound for Leo (male) and Mia (female) on that phone.
- Hosted Supabase Auth settings (Site URL, redirects, SMTP, rate limits) and real sign-in. Tables, RLS and advisors are verified.

## Decisions
- Experience first with a scripted brain; Claude API brain next (founder has Console credits). OpenAI dropped (git history at `1b1b029`).
- Mars is one sample. Subjects plug in as data (`src/lib/worlds/registry.ts`) plus a scene registered in `src/components/scene/worlds.ts`.
- Children never get accounts. Parents own learner profiles. Data is minimal: nickname, grade, language and teacher choice only.
- Pricing: one price worldwide (Solo $29, Family $79), no regional discounts. No free tier: 7-day free trial (card required, 2 live hrs), clock starts when the parent signs up and taps "Start 7-day free trial". Before the paywall: 2–3 live turns as a taste (parent-run or tap/typed only, no child voice kept before a parent account; COPPA).
- Evidence is honest: a no-hint check in the same session is a "recheck", and only a later-session check counts as independent.

## Agent sign-off (2026-11-12)
- Phase 1 rounds: tester PASS WITH NOTES; reviewer rounds 1–3 → PASS WITH NOTES (all high-severity findings fixed).
- World-system build: tester PASS WITH NOTES (10 bugs found, all fixed and now covered by tests); reviewer PASS WITH NOTES (3 high-severity findings fixed: queued lines released by an interrupt, stuck arrival, no-WebGL trip).
- Security/structure review: **PASS WITH NOTES**, no reachable hole found. Fixed:
  - column-scoped update grants;
  - sequence grants revoked;
  - honest SECURITY.md;
  - Windows-safe scripts;
  - stronger secret scan;
  - test hooks behind a build flag;
  - this file rewritten.
- Hardened-build tester round 4: **PASS WITH NOTES**, no security hole. Fixed: `__proto__` skill ids crashing /parent (app + DB check), choices lost after a failed mic tap, child stranded after Stop during arrival (new strand guard). Open low items: keyboard covering the rock at 1280×720, prefetch responses without CSP (Next default), unstyled Next error page under CSP.

## Agent experience (13 Nov)
- **Self-learning loop:** `docs/AGENT_LESSONS.md` (seeded with every recurring mistake so far, each tied to a test or check) is read first by builder, tester and reviewer. Tester and reviewer end each report with new **Lessons**; `/retro` folds them in and turns repeats into tests or /security-check steps. This is written memory plus enforcement, not model training.
- **Agents side by side:** own ports (3111 main, 3222 tester, 3333+ builders), never `pkill` others' servers, second builder in its own clone.
- **Crawlers:** robots.txt, sitemap.xml, `/llms.txt`, JSON-LD, Open Graph/Twitter cards and a share image are in. `/api`, `/parent`, `/tester` are always noindex. **Indexing is OFF** until `SITE_INDEXING=on` is set in Vercel, which should wait for a public landing page and parental consent. Next: build the landing page.

## Blockers for the founder
1. **Real-phone test.** Needs an HTTPS deploy (Vercel) or a tunnel. Run docs/DEVICE_CHECKLIST.md.
2. **Domains** (gleeful.ai / getgleeful.com — not yet checked); GitHub repo and Supabase project exist. Name screen 2026-11-13: Wander, Fieldtrip, Elsewhere, OhWow, Joyspark, Awestruck blocked; Gleeful clean on a quick USPTO + Google check (classes 9, 41). Attorney clearance and filing before public launch. Then pin the CI actions to SHAs.
3. **Stage B:** Console workspace `ai-teacher` has a **$20/month dev spend limit**; key `AI-Teacher-Brain` created there (90 days). It goes only into Vercel env as `ANTHROPIC_API_KEY` once the Vercel project exists. Pick a model after a side-by-side teaching test (Haiku 5.5 vs Sonnet 5.5; docs/COSTS.md).
4. **Production characters:** a decision on buying or commissioning rigged Leo and Mia models (cost to be quoted; nothing bought).
5. **Human review** of the Mars fact set.

## Exact next actions
1. Done 13 Nov: GitHub repo `kikosanpedro12/Gleeful` created and `main` pushed; Supabase project `gleeful` (ref `ptuglrngmovoryqqmtsw`, ap-southeast-1, Postgres 17, Data API on, auto-expose off, auto-RLS on) created. The GitHub auto-deploy needs Supabase Pro (Branching), so it is NOT used: the migration was applied by hand in the SQL Editor on 13 Nov and verified through the connector (4 tables, RLS on, security advisor shows only Supabase's own `public.rls_auto_enable()` helper, performance advisor only INFO notes). Process for every future schema change: tests + mutate + tester/reviewer PASS, then Claude sends the new migration file and Kiko pastes it into the SQL Editor. Only ever touch project ref `ptuglrngmovoryqqmtsw` for Gleeful (the Supabase connector holds one organization at a time; 1Autism is a different org). Before launch: set Site URL, redirect URLs, SMTP and rate limits in the dashboard (config.toml is not applied to production). Open: revoke public EXECUTE on `rls_auto_enable()` (confirm it does not break auto-RLS first); add covering indexes for the four composite foreign keys once there is real data.
2. Done 13 Nov: Vercel project `gleeful` in its own free Hobby team `Gleeful` (separate from the 1Autism PH team and its members), connected to `kikosanpedro12/Gleeful` `main`; every push to main deploys. Live scripted build: https://gleeful-six.vercel.app (no env vars set, no API key, model brain off). Hobby is for non-commercial use: move to Pro before launch. Founder next: the phone test (docs/DEVICE_CHECKLIST.md).
3. Builder + founder: Stage B is built (see SECURITY.md "Stage B"). Remaining: put the key in Vercel only with a LOW Console limit for a private phone test, run the Haiku 5.5 vs Sonnet 5.5 teaching comparison on the real API, then parent sign-in + server-side ownership check before any public traffic. The server must set `brain_usage.day` in the family's time zone (the database default is UTC, which would reset limits at 08:00 PH time). Consider a cap on learners per parent.
4. Builder: Stage C second subject, Gaddi's repeated division / equal groups.
5. Builder: launch cost cuts (pre-recorded voice cache, STT only while the child talks, own relay before LiveKit) — the pricing depends on them.
6. Founder + builder: Stage E remaining: dashboard Auth settings, `SupabaseLearnerStore`, parent sign-in (project, schema and advisors are done).

## Go-live checklist (remind Kiko)
- [ ] **Raise the `ai-teacher` Console spend limit** from the $20 dev cap to a launch budget (from `/cost-report` × expected users), and add an email alert at 50% and 80%.
- [ ] Separate production workspace + key from dev.
- [ ] Claude API key `AI-Teacher-Brain` (workspace ai-teacher, created 2026-11-13, 90-day expiry → ~2027-02-11). Scheduled reminder fires 2027-02-04 to rotate it.
- [ ] Re-check vendor prices (`/cost-report` step 1); Deepgram's rate is promotional.
- [ ] **BLOCKER for any public traffic: parent sign-in + usage limits in `brain_usage`.** Until then anyone can rotate address/session/learner ids and bypass every per-user cap (proven in `tests/brainAttack.test.ts`); the Console spend limit is the only hard ceiling, so keep it low and share the Vercel link with nobody.
- [ ] Server-side per-child and per-account live-minute caps on (pricing doc: Solo $29 / 10 h, Family $79 / 40 h; one price worldwide).

## Before real children or payments (not started)
See the SECURITY.md checklist: consent (COPPA, GDPR-K, Philippine Data Privacy Act), retention, vendor terms for speech, a content-safety test set, incident process, and an independent review.
