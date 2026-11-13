# Gleeful — instructions for Claude sessions

Product name: **Gleeful** (chosen 13 Nov 2026; quick USPTO + Google screen clean in classes 9 and 41, attorney clearance still needed). Mascot name idea: Glee.

Read first: PRODUCT_VISION.md → CHECKPOINT.md → BUILD_PLAN.md → docs/ARCHITECTURE.md → SECURITY.md. Workflow: docs/AGENT_WORKFLOW.md. **Before any build, test or review: read docs/AGENT_LESSONS.md** (recurring mistakes and how each is enforced). Database: docs/DATABASE.md.

- Founder is non-technical and wants short updates: status, decisions, real blockers, exact next action. Details go in files.
- Every change goes through the **tester** and **reviewer** agents (`.claude/agents/`, run in parallel by the main session) before it is called done, then `/retro` folds new lessons into docs/AGENT_LESSONS.md.
- Agents running side by side use their own ports (3111 main, 3222 tester, 3333+ builders) and never `pkill` another agent's server. A second builder works in its own clone.
- Crawlers: only the landing page (`/`) may be indexed (`src/lib/seo/site.ts`). /learn (the lesson app), /parent, /tester and /api are always noindex. Indexing is off until `SITE_INDEXING=on`.
- Routes: `/` is the public landing page (`src/app/(marketing)`, `src/components/landing/`); the lesson app lives at `/learn`.
- Never claim live voice, latency targets, lip sync or memory work unless measured. Label simulated/unverified things in UI and docs.
- Brain output (scripted or model) may only trigger validated commands in `src/lib/scene/commands.ts`, with ids the current world declares. No model-written code, HTML or remote URLs.
- Mars is one sample world. New subjects should be data in `src/lib/worlds/registry.ts` wherever possible.
- Secrets stay server-side: route handlers under `src/app/api/` (`/api/brain` exists) and `src/lib/brain/server/` with `import "server-only"`. Nothing sensitive in `NEXT_PUBLIC_*`.
- Every database change: RLS on, explicit grants, tests in `tests/db`, a planted-hole mutant in `scripts/mutate-rls.mjs`. Create migrations with `npx supabase migration new <name>`.
- Never weaken the CSP in `src/proxy.ts` to make something work; add the specific origin instead.
- No purchases, subscriptions or uncapped API spend without the founder's OK.
- New asset or source → add a row to ASSET_LICENSES.md first.
- Commit straight to `main`. Update CHECKPOINT.md at the end of each working session.

Commands: `npm run dev` · `npm run typecheck` · `npm test` (includes database security tests) · `npm run mutate` · `npm run check:secrets` · `npm run build:test` then `npm start -- -p 3111` then `npm run smoke` (full journey; `W=390 H=844 TAG=p` for phone, `RM=1` for reduced motion). `npm run smoke:landing` (landing page: poster, reduced motion, 3D flight, no-waitlist and US$ price checks; `ORIGIN=http://localhost:<port>`). `npm run build` is the deployment build (no test hooks).

## In-house skills (.claude/skills)
- `/new-world` — add a world as data + scene + tests.
- `/new-lesson` — add a K1–K12 skill: question, misconception options, hint, recall check, sources.
- `/security-check` — the full gate before any push to main.
- `/retro` — after each round: lessons into docs/AGENT_LESSONS.md, repeat findings into tests or /security-check items.
- `/cost-report` — cost per live minute and plan margins from `config/pricing.json` (`scripts/cost-model.mjs`).
Pricing strategy: claude.ai doc "Pricing Strategy — Gleeful" (https://claude.ai/artifact/5jRbinCYteSV4NzZFt7V2B).
