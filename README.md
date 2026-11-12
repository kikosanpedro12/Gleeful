# AI Teacher — prototype

A child picks Leo or Mia, an animated AI teacher in a 3D classroom, and goes on a virtual field trip to Mars. The lesson is **scripted for now, not live AI**; a Claude brain comes next. See CHECKPOINT.md for what is real and what is not.

## Run it
Needs Node 20+ and Chrome.
```
npm install
npm run dev
```
Open http://localhost:3000. Add `?dev=1` for the measurement panel. The parent view is at /parent.

## Check it
```
npm run typecheck
npm test
npm run build
npm start -- -p 3111          (leave running)
npm run smoke                 (second terminal; on Windows set CHROME to your chrome.exe path)
```

## Layout
- `src/lib/worlds/registry.ts` — worlds as data (spots, targets, tappable objects, questions, facts, sources)
- `src/lib/brain/` — the brain interface + the scripted Mars lesson (not AI)
- `src/lib/voice/` — provider boundary, scripted provider, browser speech, voice preview
- `src/lib/scene/commands.ts` — the only actions a brain can trigger, validated per world
- `src/lib/session/` — controller + store
- `src/lib/teacher/` — procedural Leo/Mia rig, animator, conversation state machine
- `src/lib/learner/profile.ts` — learner evidence (local demo storage)
- `src/components/scene/` — classroom, space flight, Mars, teacher, camera, transit director
- `docs/` — architecture, costs, device checklist, agent workflow · `.claude/agents/` — tester + reviewer
