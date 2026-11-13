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

## Styling
- **Bare element selectors in globals.css leak across surfaces** (a lesson-icon `svg { width:1.35em; path fill:none }` rule blanked the landing illustrations) → scope app styles under `.app`, landing styles under `.lp`; never style a bare element globally except resets → `npm run smoke:landing` ("poster mode shows the still illustrations").

## Ports
3111 main session · 3222 tester · 3333/3444/3555 builders · 3199 /security-check. Start with `npx next start -p <n>`, test with `SMOKE_URL=http://localhost:<n>/?test=1`, stop with `npm run stop`.

## Round log (newest first, one line each)
- 13 Nov, UX polish e8ce640: tester FAIL / reviewer PASS WITH NOTES → honesty copy keyed on reachability, 44px icons, viewportFit cover, tester code ≥16 chars, named camera framing.
- 2026-11-13: landing page round: global svg rule from the UI polish broke landing posters; scoped to `.app`.
- 2026-11-13: seeded from CHECKPOINT/SECURITY history (Stage A rounds 1-4, Stage B review + tester rounds, deploy setup).
