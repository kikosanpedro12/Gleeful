---
name: new-world
description: Add a new explorable 3D world (a place the teacher can take the child, e.g. a rainforest, ancient Rome, inside a cell, a number-line road) as data plus a reusable scene, with tests. Use when Kiko asks for a new world, place, setting or field trip.
---

# /new-world <id> "<title>" <subject> <grade band>

Worlds are DATA. The engine has no world-specific code. Read `docs/ARCHITECTURE.md` ("Worlds are data", "Adding a world") first.

1. **Plan (show Kiko in 5 lines):** what the child sees, 2–4 spots the teacher can stand at, 1–3 tappable objects, and the one skill it teaches. Ask only if the grade band or subject is unclear.
2. **Data:** add the id to `WorldId` and an entry to `WORLDS` in `src/lib/worlds/registry.ts`:
   - `environment`: reuse one if it fits (`classroom`, `planet_surface`). Otherwise add a new reusable environment, not a one-off.
   - `framing`, `background`, `transit` (`fade` unless it is a space trip), `helmet` (true only where a real person would need one).
   - `simulationNotice` whenever anything shown is pretend or simplified. This is required.
   - `spots`, `targets`, `interactive` (each with an `inspect` card whose `factIds` exist).
   - `facts`: each must have a `sourceId`. `sources` are real, reputable pages (NASA, NOAA, Britannica, a museum, a curriculum body) that you actually opened. Never invent a fact or a source.
3. **Scene:** create `src/components/scene/<World>.tsx` only if the environment is new. Use simple shapes and materials from `shared.tsx`. It must render nothing unless `fx.shown` is its id. Register it in `src/components/scene/worlds.ts`, the only world→scene map.
4. **Brain:** add the scripted path in `src/lib/brain/scriptedBrain.ts`: arrival lines, a nudge with choices, a tap reply, and a question. Use only ids the registry declares; `parseToolCall` rejects anything else.
5. **Tests:** extend `tests/brain.test.ts` and `tests/commands.test.ts`. Every target, spot and question id resolves, every fact has a source, and a hostile id is rejected. Add the trip to `scripts/journey.mjs`.
6. **Gate:** run `/security-check` steps 3 and 6. Check it on a phone-sized viewport (390×844) and with reduced motion.
7. Commit to main with a clear message. Then update `CHECKPOINT.md` and the claude.ai Project doc `claude/02_CHECKPOINT.md`.

Done means: the child can travel there and back, tap, get asked, and the parent view records the attempt. Journeys stay green.
