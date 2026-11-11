# AI Teacher — prototype (Phase 1)

A child talks to Leo, an animated AI teacher in a 3D classroom. Private family prototype; see PRODUCT_VISION.md and CHECKPOINT.md for what is real and what is not.

## Run it
Needs Node 20+.
```
npm install
copy .env.example .env.local      (Windows)   /   cp .env.example .env.local
npm run dev
```
Open http://localhost:3000 — add `?dev=1` for the measurement panel.

- **No `OPENAI_API_KEY` in `.env.local` → DEMO mode**: scripted replies, browser voice, clearly labelled. Good for seeing the body, gestures and interruption. Not AI.
- **With a key → Live mode**: real conversation over WebRTC. Set a monthly budget limit in the OpenAI dashboard first.

## Check it
```
npm run typecheck
npm test
npm run build && npm start -- -p 3111     (then, in a second terminal)
npm run smoke                              (needs Chrome; set CHROME=path on Windows)
```

## Layout
- `src/lib/teacher/` — body rig, animator, conversation state machine
- `src/lib/voice/` — provider boundary, OpenAI Realtime (WebRTC), demo provider, teacher instructions
- `src/lib/scene/commands.ts` — the only actions the model can trigger
- `src/lib/session/` — controller + store · `src/lib/telemetry/` — latency + frame stats
- `src/app/api/realtime/token/` — server route that mints short-lived voice credentials
- `docs/` — costs, device checklist, agent workflow · `.claude/agents/` — tester + reviewer
