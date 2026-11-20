# Brain learning loop (self-improving, safely)

Decision (Kiko, 21 Nov 2026): the brain must keep improving across the board, on Haiku today and any model later. Written so it also lives in the claude.ai Project sources (`claude/14_BRAIN_LEARNING.md`).

## What "self-improving" means here
The **model never edits itself, its prompt, or our code at runtime.** (CLAUDE.md: brain output only triggers validated commands; no model-written code.) What improves is everything *around* the model, in versioned files, through a loop that a test gate and a human-readable log control. Because the improvements are prompts, data, tests and assets, they carry over when the model changes (Haiku → Sonnet → next).

## The loop (every night, plus after every round)
1. **Collect** privacy-safe signals only: counts and ids, never child text, names or audio (SECURITY.md).
2. **Analyse** (a scheduled task, run by Claude): find the biggest repeat failures.
3. **Propose** one small change per failure, as a commit on a branch of files in the "may change" list below.
4. **Gate**: run the eval suite and `/security-check`; the tester and reviewer agents must pass it. Fail = discard.
5. **Land** to `main` only if every gate passes and nothing in the "human decides" list is touched. Log it in `docs/BRAIN_CHANGELOG.md` (what, why, signal before/after).
6. **Measure** next night. A change that does not move its signal, or hurts another, is reverted.

## Signals (no child content)
- Command health: rejected commands, dropped scenes/boards/gestures, moderated replies, bad/empty model outputs, retries.
- Coverage gaps: figures or topics asked about that we have no asset/lesson for (**name or skill id only, aggregated counts**); "I'm not sure" rate; questions with no matching skill.
- Learning outcomes: per-skill correct on first try, hint use, recall-check pass rate (already in parent results).
- Experience: thumbs up/down on an answer, drop-off after a reply, time to first sound (when measured).
- Cost: tokens and voice characters per answer vs the caps in `docs/COSTS.md`.

## May change automatically (after the gate passes)
- Prompt wording in `src/lib/brain/server/prompt.ts` and `src/lib/taste/server/prompt.ts` (examples, tone, format of SCENE/GESTURE/BOARD lines).
- Lesson content (questions, misconception options, hints) for existing skills, with sources.
- Golden eval cases (add a case for every real failure found).
- New assets/figures from the coverage-gap queue (cap per night; licence row first; Tripo spend within the nightly cap Kiko sets).
- Docs: `docs/AGENT_LESSONS.md` via `/retro`.

## Kiko decides (never automatic)
Prices and plans, anything legal or privacy (consent, retention, what we log), new vendors or spend above caps, safety rules and CSP, database schema or RLS (needs migration + tests + mutant), changes to what the child can see about real people, model/vendor switches.

## Eval suite (the gate; build first)
`tests/evals/`: fixed prompts with checkable expectations, run against the scripted brain in CI and against the live model on demand (capped spend).
- **Safety**: injection attempts, personal-info requests, self-harm, mature, medical/legal; must refuse or redirect.
- **Format**: reply length, no markdown/links, valid SCENE/GESTURE/BOARD lines only.
- **Accuracy**: curated facts per world/skill with their sources; "I'm not sure" is allowed, a wrong fact is a fail.
- **Pedagogy**: misconception handling, hint-before-answer, recall check scheduling.
- **Honesty**: never claims a picture/voice/memory that is not shown; labels simulated things.
A change lands only if no eval regresses. Haiku and Sonnet both run it, so a model switch is a measured decision.

## Coverage-gap queue (figures, topics)
Tiers: 3D character → credited public-domain portrait → name card with no face. Each miss adds +1 to a counter keyed by figure/topic id. The nightly task builds the top few (cap per night), adds the licence rows, tests, lands. Recent or living people stay name cards.

## Build order
1. `tests/evals/` + `npm run evals` (offline, scripted brain), then live mode behind a spend cap.
2. Privacy-safe counters: server logs already carry types and counts; add a `brain_signals` table (aggregates only; RLS on, server-only write, tests, mutant) once Kiko OKs what is logged.
3. Nightly scheduled task: analyse → propose → gate → land → `docs/BRAIN_CHANGELOG.md`.
4. Gap queue + Tripo figure pipeline (`scripts/shrink-glb.mjs`).
5. Weekly report to Kiko: 5 lines (what improved, what regressed, spend, decisions needed).

## Rules the loop never breaks
No child text stored or sent to training; no autonomous spend beyond caps; no change to the "Kiko decides" list; every change reversible with one `git revert`; every claim in UI stays measured or labelled.
