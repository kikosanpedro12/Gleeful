# Gleeful Scene Kit Spec (v0.1, 14 Nov 2026)

Copy of the project doc `10_SCENE_KIT_SPEC.md`; code comments cite this file.

## Principle
Scenes are not generated live. We build a kit of reusable parts once; the brain composes lessons from it with validated tool calls (openWorld, pointAt, gesture, writeOnBoard, showWidget, hideWidget). Per-session scene cost is about $0 (renders on-device). Image/video tools are used OFFLINE only (textures, skyboxes, concept art), never during a lesson.

## Widgets (priority order)
1. Text/equation board (writeOnBoard), later step-by-step reveal
2. Number line (integers, fractions, decimals, jumps) — BUILT 14 Nov
3. Fraction bars — BUILT 14 Nov
4. Graph · 5. Balance scale · 6. Shape/geometry viewer · 7. Timeline · 8. Map · 9. Sentence builder · 10. Periodic table / molecule viewer

## Widget rules (as built)
- One widget on screen; the brain may add at most one `showWidget` per reply; refused during transit.
- Specs are numbers and fractions only (no strings): at most 24 ticks, 6 marks, 4 bars, 12 parts, values within ±1000. Validated in `src/lib/widgets/spec.ts` and again on the server.
- The child's setting reaches the brain as a `widget` input. The `target` is sent by the client, so the app only *reports* a match; it is not evidence and never records mastery or escalates the model.

## Environments and behaviors
Mars is built; next: studio, lab, ocean, cell, ancient city, jungle, kitchen, market/cafe. Behaviors: point, walk-to, pick-up, zoom, highlight, animate, spawn/remove, show widget. If no part fits: speak plus text board, and log the unmet request.

## Open questions
Which 5 widgets ship in the MVP? Which grades first (K-4 data is thin)? Parent willingness to pay per subject (needs interviews).
