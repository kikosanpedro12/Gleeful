# Architecture (updated 2026-11-12)

Stack: Next.js 16 · React 19 · TypeScript · Three.js + React Three Fiber 9 · Zustand. Database: Supabase schema written and tested (supabase/, docs/DATABASE.md), **not deployed or wired yet**; the app saves through `LearnerStore` (this browser only today). No AI calls yet: the brain is scripted, and a Claude API brain plugs in at Stage B.

## One turn, end to end
```
child taps / speaks / types
  → SessionController           (turn ids, worlds, choices, questions, taps)        src/lib/session/controller.ts
  → VoiceProvider               (scripted now: browser speech + ScriptedBrain)      src/lib/voice/
  → Brain.respond()             (returns { segments: [{ say, actions }] })          src/lib/brain/
  → each action validated against the CURRENT world                                 src/lib/scene/commands.ts
  → store (Zustand)             (conv state, world, transit, directives, UI)        src/lib/session/store.ts
  → 3D scene reads the store every frame                                            src/components/scene/
       TeacherActor → TeacherAnimator (walk, point, gesture, gaze, mouth, helmet)
       Director     → world travel timeline (walls open → space → land)
       CameraRig    → shots per world, portrait and landscape
```

## Worlds are data
`src/lib/worlds/registry.ts`. A world declares:
- its spots (where the teacher can stand)
- its targets (what can be pointed at)
- its interactive objects (what can be tapped, plus the inspect text)
- its questions (options, a hint, an explanation)
- its facts with sources, a simulation notice, a helmet flag and its transit style

The brain and the validator can only use ids the current world declares. Adding a subject means:
1. Add a world entry (or a classroom activity) with its facts, questions and spots. This part is data.
2. Reuse an existing environment (`classroom`, `planet_surface`). Only a genuinely new kind of place needs a new scene component.
3. Add a lesson to the brain. Scripted now; Claude later reads the world data directly, so new lessons won't need code.

Known gap: the scripted brain is Mars-specific code. That is acceptable because Stage B replaces it, but a second scripted subject would currently mean a second scripted lesson.

## Key rules
- **Turn ids everywhere.** Every child input bumps the turn. Speech, captions, tool calls, directives, choices and invites from an older turn are dropped. Teacher-initiated lines (the greeting, mid-flight remarks, the arrival) wait until the teacher stops talking.
- **The brain cannot run code.** It only gets prepared commands: gesture, pointAt, moveTeacherTo, writeOnBoard, openWorld, offerChoices, askQuestion and inviteTap. Board and choice text is plain text, sanitised and capped, and drawn to a canvas, never rendered as HTML.
- **Honest learner evidence.** Attempts record correctness, hints used and context (`taught` vs `later_check`). One assisted correct answer is never shown as mastery.
- **Measurement built in.** Per turn we log input → first audio and input → first animation; frame stats include the 1% low and stalls. Scripted timings never count as AI latency.

## Adding a world (subject)
1. Data: `src/lib/worlds/registry.ts`.
2. Scene component: `src/components/scene/<World>.tsx`. It shows itself when `fx.shown` is its id.
3. Register it in `src/components/scene/worlds.ts`, the only file that maps worlds to scenes.

The engine (Director, CameraRig, Lights, TeacherActor) reads framing, background, planet and ground from the registry and `worlds.ts`, and has no world-specific code.

## Security layers (see SECURITY.md)
`src/proxy.ts` (per-request CSP nonce) · `next.config.mjs` (headers) · `src/lib/scene/commands.ts` (only validated actions) · `src/lib/learner/store.ts` (validated storage) · `supabase/migrations` (RLS, grants, composite keys) · `tests/db` + `scripts/mutate-rls.mjs` (proof).

## Stage B plug-in point
Write a `ClaudeBrain` behind `/api/brain`, with the key kept on the server:
- Input: the world's facts and sources, `toolsFor(contextFor(world))`, a short learner summary and the recent turns.
- Output: the same `{ segments }` shape the scripted brain returns.
- The scripted provider's speech layer stays as it is.
