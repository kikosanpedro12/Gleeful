# Gleeful Scene Kit Spec (v0.2, 18 Nov 2026)

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


## v0.2 (18 Nov): any question, right format, asset library
Founder direction: a child can ask about anything. The brain answers any genuine learning question; the *format* follows the topic.

### Three response modes (the brain picks one per question)
1. **Direct** — skill topics (algebra, Cartesian plane, fractions, grammar, spelling). Answer in speech plus board and a widget (graph, number line, fraction bars, sentence builder). No travel, no story.
2. **Story scene** — people, events and places (Napoleon, the Philippine Revolution, volcanoes, rainforest). Take the child there: environment + props + narrated story + one check question.
3. **Mixed** — e.g. how a volcano works: a place plus a diagram/widget.
Fallback in every mode: speech + text board, and log "could not visualize: X".

### What a frame is (a scene spec, data only)
`{ mode, environment, era/place label, props[], figure?, backdrop, narration beats[], question? }`
- `environment` and every `prop` id must exist in the asset library manifest (validated server-side; unknown ids rejected, never loaded).
- `figure`: historical people are shown as a public-domain painting/portrait in a frame with a credit line, never a made-up 3D face. No likenesses of living people. Leo and Mia are the only animated characters.
- Every story scene carries a visible label: "A pretend picture to help us imagine, not the real thing."
- No model-written code, HTML or remote URLs. The model only picks ids.

### Art direction
One look per scene, never mixed: realistic (Poly Haven, history/science) or stylized (Quaternius, nature/younger grades). Not low-poly for people. Small files (target under 1 MB per asset, 5 MB per scene) for mid-range phones such as the Honor X9b.

### Asset library
Source of truth: `src/lib/assets/manifest.ts` (id, name, source, licence, file, size, tags). Sources: Poly Haven (CC0, confirmed 18 Nov at polyhaven.com/license), Quaternius (QAL v1.0, free commercial use, no credit, no standalone redistribution; lawyer to confirm bundled-in-app use), own Blender work. Each asset needs a row in ASSET_LICENSES.md first. Blender is for shrinking, recoloring and filling gaps. Paid items need the founder's OK.
Note: the build sandbox cannot download from polyhaven.com or quaternius.com; files are fetched on the founder's computer or by an approved route, then committed.

### Open
Which 30 starter assets; who fetches them; painting sources for historical figures (Wikimedia Commons public-domain, credited).

## Update 19 Nov (founder decision)
Historical people are shown as a **3D character** in the era scene (not only a painting). One character look for all people, not low-poly; a credited public-domain painting may sit beside it as the reference. Source of characters is open (Quaternius stylised, Mixamo/Sketchfab with licence check, or Blender); each needs an ASSET_LICENSES.md row first, and the figures manifest stays empty until then. Also built 19 Nov: `showScene`/`hideScene`, the display-only graph widget, per-asset cap 1,500 KB and per-scene cap 3,000 KB. The full, current spec is the project doc `10_SCENE_KIT_SPEC.md`.
