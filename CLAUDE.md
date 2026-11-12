# AI Teacher — instructions for Claude sessions

Read first: PRODUCT_VISION.md → CHECKPOINT.md → BUILD_PLAN.md → docs/ARCHITECTURE.md → SECURITY.md. Workflow: docs/AGENT_WORKFLOW.md. Database: docs/DATABASE.md.

- Founder is non-technical and wants short updates: status, decisions, real blockers, exact next action. Details go in files.
- Every change goes through the **tester** and **reviewer** agents (`.claude/agents/`) before it is called done.
- Never claim live voice, latency targets, lip sync or memory work unless measured. Label simulated/unverified things in UI and docs.
- Brain output (scripted or model) may only trigger validated commands in `src/lib/scene/commands.ts`, with ids the current world declares. No model-written code, HTML or remote URLs.
- Mars is one sample world. New subjects should be data in `src/lib/worlds/registry.ts` wherever possible.
- Secrets stay server-side: route handlers under `src/app/api/` (none exist yet; Stage B) with `import "server-only"`. Nothing sensitive in `NEXT_PUBLIC_*`.
- Every database change: RLS on, explicit grants, tests in `tests/db`, a planted-hole mutant in `scripts/mutate-rls.mjs`. Create migrations with `npx supabase migration new <name>`.
- Never weaken the CSP in `src/proxy.ts` to make something work; add the specific origin instead.
- No purchases, subscriptions or uncapped API spend without the founder's OK.
- New asset or source → add a row to ASSET_LICENSES.md first.
- Commit straight to `main`. Update CHECKPOINT.md at the end of each working session.

Commands: `npm run dev` · `npm run typecheck` · `npm test` (includes database security tests) · `npm run mutate` · `npm run check:secrets` · `npm run build:test` then `npm start -- -p 3111` then `npm run smoke` (full journey; `W=390 H=844 TAG=p` for phone, `RM=1` for reduced motion). `npm run build` is the deployment build (no test hooks).
