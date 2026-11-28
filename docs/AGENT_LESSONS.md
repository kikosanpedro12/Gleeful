# Agent lessons (read before every build, test or review round)

This is the team's memory. Agents do not learn between sessions on their own: this file is how a mistake found once stops happening again. `/retro` maintains it after each round.

Rules for entries:
- One line per lesson: **pattern → rule → where it is enforced** (a test, a check, or a checklist line). A lesson with no enforcement is not finished.
- Only recurring or costly patterns. Delete entries whose enforcement makes them impossible to repeat and that have not recurred in 5 rounds (note the removal in the round log at the bottom).
- Keep this file under ~120 lines.

## Data from the browser or the model
- **Untrusted ids used as object keys** (`__proto__` skill id crashed /parent) → look ids up with `Map` / `Object.hasOwn`, validate with the shared regex (`SKILL_RE`) in the app AND a DB `check` → `tests/store.test.ts`, `tests/db/attacks.test.ts`, /security-check step 7.
- **Client-asserted facts treated as truth** (attempt `context`, `hintsUsed` forcing Sonnet, `started_at` back-dated) → the server or database decides; the client's value is a hint at most → `tests/brainServer.test.ts`, `tests/db/rls.test.ts` (started_at), mutant "client can back-date a session".
- **Model text rendered with only partial cleaning** (board text and choice labels skipped the link filter; emails and shorteners slipped through) → every model string goes through `sanitizeSay` before any surface → `tests/brainAttack.test.ts`.
- **Rules that live only in the prompt** ("one question per reply") → enforce in code after the model answers → `buildReply` tests.

## Limits and spend
- **In-memory limits on serverless are per warm instance** and reset on cold start → call them a brake; the Console spend limit is the ceiling until `brain_usage` is wired → SECURITY.md "Stage B", CHECKPOINT go-live list.
- **Keys chosen by the client (learnerId, sessionId, forwarded IP) can be rotated** to bypass per-user caps → no public traffic until sign-in + DB limits; private tests behind a tester passcode → `tests/brainAttack.test.ts` (skipped repro), go-live blocker.
- **Evict-oldest tables let an attacker reset a victim's counters** → full tables refuse NEW keys, never evict live ones → `tests/brainServer.test.ts`.
- **Lengths counted in characters, not bytes** → cap request bodies in bytes, read as a stream with a timeout → brain route tests.

## Conversation flow
- **Child stranded after Stop / failed mic tap** (prompt lost, nothing on screen) → strand guard restores the unanswered prompt or sends `resume` → `tests/controller.test.ts`.
- **Old turns leaking after an interrupt** (queued lines, gestures) → every action carries a turn id and is dropped when stale → controller and stateMachine tests; tester step 4(a).

## Honesty
- **Labels that claim more than is running** (badge said AI when the script answered; scripted Mia said "your AI teacher") → the badge is bound to the brain that actually answered; scripted copy never claims AI → `tests/brainKind.test.ts`, journey check; reviewer treats overclaims as BLOCK.
- **AI copy gated on the build flag, not on what the visitor can reach** (model build behind the tester gate: visitors without the code heard "I'm an AI teacher" and got the script) → AI wording follows `useReach().ai` = probe `configured` + (gate off or tester code present), never `NEXT_PUBLIC_*` alone; until the probe answers, show the non-AI copy → `tests/honesty.test.ts` renders the start screen and preview line for scripted / no key / gate without code / with code.
- **Page titles / social cards claim more than the page** (`<title>` said 'a live AI teacher' while the public demo is scripted; titles reach Google and link previews where the body's caveats do not) → every title and description must say 'early access' and never 'live'; tests/seo.test.ts checks them.
- **Docs saying something is deployed or verified when it is not** (CHECKPOINT said the migration auto-deployed; it had not) → only write "done" after checking the live system (connector, curl, dashboard), and say how it was checked.

## Platform facts that bit us
- **Supabase GitHub auto-deploy needs Pro (Branching).** On the free plan migrations do NOT go live on push → Kiko pastes each reviewed migration into the SQL Editor; verify with the connector (`list_tables`, `get_advisors`) → docs/AGENT_WORKFLOW.md.
- **The Supabase connector holds one organization at a time** (Gleeful vs 1Autism) → always pass the Gleeful project ref `ptuglrngmovoryqqmtsw`; never act on another org's project.
- **Vercel Hobby team "Gleeful" is separate from 1Autism PH** → never deploy Gleeful into the 1Autism team.
- **Prices and model ids change** → check official pages before quoting (`/cost-report` step 1).

## How agents work together
- **Forks cannot spawn agents** → the orchestrator (main session) runs tester and reviewer itself after a fork builds; a fork's self-review is never a verdict.
- **Agents clashed on port 3111 and `pkill -f next-server` killed each other's servers** → each agent uses its own port (`PORT`, see below) and stops only the PID it started → /security-check, tester.md.
- **`kill $!` after `npx next start` kills npx, not the server**, so the old build kept answering and a check looked like it failed → `npm run stop` (scripts/stop-server.mjs) stops only this checkout's next-server → tester.md, /security-check.
- **`pkill -f "next start"` also kills any shell whose command line contains that text** (another agent's gate died mid-run) → never pkill by pattern; use `npm run stop`.
- **Journey timing checks can flake when two agents run Chrome at once** ("mouth moves while speaking" failed once under load, passed on rerun) → rerun once before reporting; a failure that repeats is real.
- **Two builders editing one working tree** → a second builder works in its own clone and runs `git pull --rebase origin main` plus the gate before pushing.
- **Tester ran on a moving tree** (files edited mid-run) → test a pinned commit (`git archive <sha>` into a temp dir) when others are building.

## Honesty and accessibility
- **A code-side text filter on model output deleted a required safety answer** (the no-re-intro strip removed "I'm Leo, an AI teacher" for a child asking "are you a robot?") → scope output filters to the input kinds they target; test that every SAFETY_RULES obligation survives `buildReply` → `tests/uxRound.test.ts`.
- **`aria-label` on a composite badge dropped a visible honesty label** ("Simulation") → the accessible name must include every visible label.
- **Client-asserted facts reach the prompt** (widget `target`) → word them as "the app reports", never as ground truth; no evidence recording or escalation off them.
- **Code cited a spec file that wasn't in the repo** → every `docs/X.md` reference must resolve.
- **Early return after a temporary state mutation** (Prewarm left hidden worlds visible) → restore in a `finally` that wraps everything after the mutation.
- **Formatters that round can map distinct ticks to one label** → validate format against step (integer needs whole numbers; decimal ≤3 places) so a false CORRECT is impossible → `tests/widgets.test.ts`.
- **Shared "last answered" state set by cancelled/slow async runs** → badge kind follows the latest turn only (FallbackBrain sequence) → `tests/claudeBrain.test.ts`; a test must never enshrine a behaviour that contradicts the honesty rule.
- **`compileAsync` polls forever after context loss** → use sync `gl.compile` and skip when the context is lost.

## Media and new vendors
- **Async fetch before playback with no stale guard** (voice lab: a slow first tap could start sound after the listener moved on) → bump a request id in stop()/play() and bail after every await.
- **Blind-test UI let a listener rate a voice that never played** → rating enabled only after the slot has actually started.
- **Page copy said "sends nothing" after a fetch was added** → `tests/voiceLab.test.ts` checks the page's copy against its fetch use.
- **A new vendor key needs four things in the same change**: secret-scan regex, `.env.example`, ASSET_LICENSES row, SECURITY.md section.
- **Counter refunds after an await must use the bucket captured before it** (day rollover).

## Styling
- **Bare element selectors in globals.css leak across surfaces** (a lesson-icon `svg { width:1.35em; path fill:none }` rule blanked the landing illustrations) → scope app styles under `.app`, landing styles under `.lp`; never style a bare element globally except resets → `npm run smoke:landing` ("poster mode shows the still illustrations").

## Classroom landing UI (Nov 2026)
- A `display:grid` card with one auto column grows to its widest child's min-content (a text input pushed the Ask button out of the card on a 390px phone) -> `grid-template-columns: minmax(0, 1fr)` on card grids; check the right edge in the phone screenshot.
- Where the headline pill goes depends on the state: it hid Leo's face (left) in the choose state and the board text (centre) otherwise. Read BOTH the choose and chat screenshots after moving any overlay; never judge from one state.
- Body font Atkinson draws a slashed zero: do not show a bare "0" counter; say "3 free tries" instead of "0 of 3 used".
- A disabled pill must still look like a pill: solid neutral fill, 2px edge, 5.6:1 text, no 3D shadow; never `opacity` on a pink button (reads as broken).
- Bare `.lp :focus-visible { border-radius: 6px }` squares the focus ring of rounded cards: set the card radius on its own `:focus-visible`.
- `kill` only the PID of your own port (find it by `/proc/<pid>/cwd` and cmdline); `pkill -f next` or a loop over every match can hit another agent's server.
- A fixed-width centred card and a right-hand picture overlap on 1280px desktops (the card hid the first words of the 'pretend picture' label); and a long spoken reply grew the phone card until it covered the tutor's face. -> size side panels from the card edge (`50vw - 334px`), cap phone card padding/fine print, and screenshot the LONGEST reply in the speaking state on both viewports (`scripts/cap.mjs` pattern in a /tmp copy).
- A changing label plus `aria-pressed` reads twice ("Voice off, pressed"): use one or the other. A pink focus ring on a cream card is 2.6:1: add the night ring.

## Ports
3111 main session · 3222 tester · 3333/3444/3555 builders · 3199 /security-check. Start with `npx next start -p <n>`, test with `SMOKE_URL=http://localhost:<n>/learn?test=1`, stop with `npm run stop`.

## Round log (newest first, one line each)
- 14 Nov, tester on 88bc432: BLOCK (Prewarm early return left hidden worlds visible) + badge claimed AI while the script greeted + integer number lines with fractional steps → all fixed in 1a93baa, tests added; pushed.
- 14 Nov, UX + widgets + voice lab f86251f: reviewer BLOCK (intro filter deleted the AI-disclosure answer) → scoped to teacher-started inputs, tests added; aria-label, 44px close, sync prewarm, spec doc, SECURITY/ARCHITECTURE notes.
- 13 Nov, landing round 7357234: tester PASS / reviewer found overclaiming <title> + 28px footer links → titles say early access (test added), footer links 44px.
- 13 Nov, UX polish e8ce640: tester FAIL / reviewer PASS WITH NOTES → honesty copy keyed on reachability, 44px icons, viewportFit cover, tester code ≥16 chars, named camera framing.
- 2026-11-13: landing page round: global svg rule from the UI polish broke landing posters; scoped to `.app`.
- 2026-11-13: seeded from CHECKPOINT/SECURITY history (Stage A rounds 1-4, Stage B review + tester rounds, deploy setup).

## Landing tags (Nov 2026)
- Tags are factual claims: shapes, scale and motion must be accurate or labelled ("not to scale"). A caveat must be visible whenever the claim it qualifies is visible.
- A hide rule needs a must-show test for the viewport it is meant to show in (`tests/landingTagsView.test.ts`).
- A guard test must check WHAT the target is, not only where it is (`tests/landingTagIdentity.test.ts`). Break each new guard once (swap or move the target) and see it fail.
- Commit only after the tester's verdict on that exact file hash.
- Tester works in a pinned copy (/tmp/t); never run `npm run build` in a checkout another agent serves. `npm run stop` matches by cwd and can kill other agents' servers.
- Open low notes: vacuole tag over a chloroplast; fraction tags cover the 3/4 and 1/2 tiles on desktop; Moon tag small on desktop; Box3 counts hidden helmet.

## Voice route (ElevenLabs, Nov 2026)
- A new vendor key needs all four in the same change: `check-secrets` public-name pattern, `.env.example`, ASSET_LICENSES row, SECURITY.md section. `tests/elevenPlayer.test.ts` now checks the pattern; still check the other three by hand.
- Every cancel path must settle the promises it orphans. For each `await new Promise` ask what resolves it on stop (`tests/elevenPlayer.test.ts`).
- A timing figure is shown only if its event occurred (audio context running) and is labelled an estimate. No latency claim in docs until measured against a recording on the real phone.
- Do not hardcode a model name in a label when the model comes from config.
- Probe via the account endpoint may 401 with a Text-to-Speech-only key; `keyValid:false` does not prove a bad key (unverified).
- Open low notes: no `cancel()` cleanup of timers on client disconnect; sources not disconnected after long lines; GET /api/voice has no rate limit.
- Splitting a shared bucket per owner multiplies the class total: add a class cap (`tester*`) and a test, and state the new sum in SECURITY.md. A rollover must REPLACE the bucket object (never reset it in place) so a refund from the old day cannot touch today (`tests/invites.test.ts`).
- `MemoryUsageStore.reserve*` only changes an entry that `*Today` has already created; call the `*Today` first in tests.

## Second world (Market, Nov 2026)
- Brain code that branches on the world must handle EVERY WorldId; worlds connect through the classroom hub. Enforced by the intent × world matrix in `tests/brain.test.ts` (every reply valid and ends in a next step; "on our way" only in transit).
- Inspect text must never contain a question's hint or numeric answer (data test in `tests/brain.test.ts`).
- Every tappable mesh checks `fx.shown` (and no transit) BEFORE `stopPropagation`: R3F raycasts invisible meshes, and worlds share space.
- Spoken number answers: "=" exact words; "~" homophones (for/to/ate) only in replies of up to 3 words.
- Closing an inspect card re-arms the strand guard (`tests/marketStrand.test.ts`). Numeric answers: a full working sentence uses the part after the last "is/equals/=" ("12 divided by 3 is 4" → 4); "four or six" still asks again.
- Tester sweeps: `tests/marketBreak.test.ts` (every probe × every world), `scripts/break-market.mjs` (browser break run, ~12 min per viewport).

## From the GLB teacher build (21 Nov 2026)
- Never call `skeleton.pose()` on a quantized skin: it rebuilds the rest pose from changed inverse bind matrices (hips scale 2x). Restore a pose with `mixer.uncacheRoot`.
- No meshopt or Draco: both need WebAssembly and the CSP has no `'wasm-unsafe-eval'`. Quantization only; a test checks the extensions.
- three's GLTFLoader turns `mixamorig:Hips` into `mixamorigHips`; look bones up by the sanitised name.
- Lookups by model/user-supplied ids go through a Map (or `Object.hasOwn`), never a plain object: `"__proto__"` and `"constructor"` are hostile ids. Guard numeric inputs (`Number.isFinite`).
- Rotations around the same axis commute, so a retarget-frame test that uses only such clips cannot catch a wrong frame. Use clips that rotate about different axes, and mutate-check new tests.
- Floor checks after one-shot acts must poll, not sleep a fixed time (software rendering is slow).
- Chrome smokes on this 2-core box: run them ONE AT A TIME. Parallel runs fail on timing, not on bugs. A failing check is re-run once before it is called a failure; a check that passes alone and fails in parallel is a timing note, not a bug.
- A smoke that asserts rig-specific behaviour (mouth, jump height, pose) must read the rig kind (`window.__teachers.<id>.rig.glb`) and carry per-rig expectations. The GLB teachers have no mouth: `mouthOpen` is 0 and speech is body emphasis, never lip sync.
- Pinned copies for testing (`/tmp/...`) need `cp -al` for node_modules: Turbopack rejects a symlinked node_modules. A static-file header set in next.config only shows in a production build (not `next dev`).
- "Height" reported by a rig must mean what the test means: a run clip's flight phase is not a jump. Only jump, climb and swim count as air (glbAnimator).
- Two cards stacked at the bottom of a hero cover the tutor's face: after changing what stays on screen, look at the 1280x800 and 390x844 screenshots, not only the checks.
- Debug overlays (?perf=1): z-index above the cards, max width so it stays clear of a centred card (card left edge 341px at 1280), aria-hidden, pointer-events none. Phone: it covers the "For parents" link while on (debug only).

## Billing (23 Nov 2026)
- **Webhook events arrive out of order and get retried** → every grant is checked against the row we hold (`ruleFor` in `src/lib/billing/store.ts`): stale events ignored, refunded is terminal, a late payment cannot revive a cancelled plan, a trial start only creates → `tests/billingServer.test.ts` "ordering and abuse rules".
- **A webhook body cap checked after a full read is not a cap** → read as a stream with a deadline (`readBody`) → the route uses it.
- **Checks that depend on `NEXT_PUBLIC_*` cannot be tested on a prebuilt server** → build with the env set, or mark the check unverified.
- **A vendor's unpublished payload shape is a risk, not a fact** → label UNVERIFIED in code and docs, fail closed, capture a real event before live.

## Admin numbers, feedback, picker (24 Nov 2026)
- **Anonymous write endpoints need a database-side cap, not only a per-instance limiter** → `saveFeedback` refuses past 100 an hour / 5000 total (429) → tests/feedback.test.ts. Bots that fill the honeypot get a normal 200.
- **A feature that stores personal data changes the privacy page, retention and deletion path in the same commit** → /privacy "Feedback" section, SECURITY.md names the manual delete.
- **`FOR UPDATE` on a row that does not exist yet locks nothing** → `pg_advisory_xact_lock(hashtext(email))` at the top of the billing transaction.
- **Counts the founder reads must say what they include** → admin revenue says it includes sandbox/test purchases and is an estimate.
- **Adding a private route means three places** → `PRIVATE_PREFIXES` (site.ts), `PRIVATE_ROUTE_SOURCES` (next.config.mjs), `public/llms.txt`; tests/seo.test.ts catches a miss.
- **Inline SVG avatars**: the global `.app svg path { fill:none }` overrides fill attributes, so use style fills. `.tag` is already a scene-label class; do not reuse it.
- **Mutant patterns must be re-synced after any edit to the SQL they match** (a SKIP is a hole, not a pass).
- **Admin charts/cards judged from code** → /admin has a dev-only fixture (SAMPLE data, not in src): `node scripts/admin-fixture.mjs` builds the real components and shoots 1280 and 390 (full + empty) into scripts/out/admin-*.png; read them → tests/adminDashboard.test.ts.

## Product events (24 Nov 2026)
- **`scripts/mutate-rls.mjs` had a syntax error at HEAD** (an unescaped `"` in the feedback e-mail mutant), so `npm run mutate` could not start and nothing had run it since → after editing the script run `node --check scripts/mutate-rls.mjs` first; a SKIP or a crash is a hole, not a pass.
- **Analytics tables are a new anonymous write path** (error events come from the landing Ask box and voice) → cap in the INSERT itself (hourly per class, total by `max(id)`, which is O(1)), error codes never carry a parent id (CHECK) → `tests/db/appEvents.test.ts` "write caps".
- **Never put a child's content or an e-mail in an event; tags are re-validated on the way in AND out** (cookie is user-controllable) → `sanitizeTag`/`sanitizeHost` + `tests/events.test.ts` hostile cases.
- **Counts for "people" vs "events" must be labelled** (funnel mixes our distinct parents with Freemius webhook events) → the card says WEBHOOK EVENTS on those steps → `tests/adminDashboard.test.ts`.
- **A new table makes /admin depend on a migration that may not be applied** → `loadEventStats` failure is caught (42P01 = "not applied") so billing numbers still render.
- **Third-party analytics script placement is a privacy claim** → `PublicAnalytics` only in the marketing and sign-in layouts; a test greps `src/` for every user of it.
- **Analytics writes held a response** (sign-in, parent page, checkout waited on a raced await) → run them with `later()` (Next `after()`) so the redirect goes first; read cookies/session BEFORE, never inside the callback → `tests/events.test.ts` "writes that must not hold a response" (greps for `await recordEvent(`); /security-check lists it.
- **"Seen" markers set before the write** (an active-day write that failed was never retried that day) → add to the in-memory set only after the write succeeded (`tryRecord` returns a boolean) → `tests/events.test.ts` retry test.
- **One shared cap lets one actor starve another, and `max(id)` caps drift** (`ON CONFLICT` burns ids; 2000 checkout clicks blocked all sign-ups) → a cap per code/actor, a unique index for "once per day", `count(*)` for lifetime, and an in-memory throttle in front of anonymous-reachable writes → `tests/db/appEvents.test.ts`, `tests/db/appEventsAttack.test.ts`, `cap:` mutants in `npm run mutate`.
- **Sanitisers that "fix" input invent values** (`Summer Sale` became `summer-sale`) → drop anything outside the allowed set → `tests/events.test.ts`.
