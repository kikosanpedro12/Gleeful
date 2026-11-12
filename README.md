# AI Teacher — prototype

A child picks Leo or Mia, an animated AI teacher in a 3D classroom, and goes on a virtual field trip to Mars. The lesson is **scripted for now, not live AI**. A Claude brain comes next. See CHECKPOINT.md for what is real and what is not.

## Run it
Needs Node ≥ 20.9 and Chrome.
```
npm ci
npm run dev
```
Open http://localhost:3000 (the parent view is at /parent).

## Check it (same as CI)
```
npm run typecheck
npm test               # unit tests + database security tests on real Postgres (PGlite)
npm run mutate         # plants 14 security holes; the tests must catch every one
npm run check:secrets
npm run build:test     # test build (browser test hooks on). Deploy with `npm run build`.
npm start -- -p 3111   # leave running
npm run smoke          # second terminal; on Windows set CHROME to your chrome.exe path
```

## Layout
| Path | What |
|---|---|
| `src/app/` | Pages (`/`, `/parent`), layout |
| `src/proxy.ts` | Per-request Content Security Policy (nonce) |
| `src/components/` | HUD, dev panel, 3D stage; `scene/` = classroom, space, Mars, teacher, camera, travel director, `worlds.ts` |
| `src/lib/worlds/` | Worlds as data: spots, targets, tappable objects, questions, facts, sources |
| `src/lib/brain/` | Brain interface + the scripted Mars lesson (not AI) |
| `src/lib/voice/` | Provider boundary, scripted provider, browser speech, voice preview |
| `src/lib/scene/commands.ts` | The only actions a brain can trigger, validated per world |
| `src/lib/session/` | Controller (turns, travel, input) + store |
| `src/lib/teacher/` | Procedural Leo/Mia rig, animator, conversation state machine |
| `src/lib/learner/` | Learner evidence, honest status rule, `LearnerStore` (local now, Supabase later) |
| `supabase/` | Supabase config + migrations (schema with row-level security) |
| `tests/`, `tests/db/` | Unit tests; database attack tests |
| `scripts/` | Browser journey, mutation test, secret scan |
| `docs/` | Architecture, database, costs, device checklist, agent workflow |
| `.claude/agents/` | Tester and reviewer agents |
| `.github/` | CI + Dependabot |
