# AI Teacher — instructions for Claude sessions

Read first: PRODUCT_VISION.md → CHECKPOINT.md → BUILD_PLAN.md → docs/ARCHITECTURE.md. Workflow: docs/AGENT_WORKFLOW.md.

- Founder is non-technical and wants short updates: status, decisions, real blockers, exact next action. Details go in files.
- Every change goes through the **tester** and **reviewer** agents (`.claude/agents/`) before it is called done.
- Never claim live voice, latency targets, lip sync or memory work unless measured. Label simulated/unverified things in UI and docs.
- Brain output (scripted or model) may only trigger validated commands in `src/lib/scene/commands.ts`, with ids the current world declares. No model-written code, HTML or remote URLs.
- Mars is one sample world. New subjects should be data in `src/lib/worlds/registry.ts` wherever possible.
- Secrets stay server-side (`src/app/api/`). Nothing sensitive in `NEXT_PUBLIC_*`.
- No purchases, subscriptions or uncapped API spend without the founder's OK.
- New asset or source → add a row to ASSET_LICENSES.md first.
- Commit straight to `main`. Update CHECKPOINT.md at the end of each working session.

Commands: `npm run dev` · `npm run typecheck` · `npm test` · `npm run build` · `npm start -- -p 3111` then `npm run smoke` (full journey; `W=390 H=844 TAG=p` for phone, `RM=1` for reduced motion).
