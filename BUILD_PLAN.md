# Build plan — Gleeful (updated 2026-11-13)

**Founder decision (12 Nov):** lead with the experience. Build the "wow" with a scripted brain (free, clearly labelled), then plug in a real brain via the **Claude API** (founder has Console credits). OpenAI Realtime is dropped (still in git history at commit `1b1b029`).

**Mars is one sample.** The engine must work for any K–12 subject: math, science, English, geography, history, GMRC. A subject is added as **data** (a world or classroom activity + facts + questions), not new engine code, wherever possible.

## Stages
| Stage | What | Status |
|---|---|---|
| A. Wow slice (scripted) | Pick Leo/Mia with voice preview · classroom → walls peel open → space flight → Mars landing · Leo walks, points, gestures, helmet · tappable/spinnable rock that changes the lesson · question with hint · choose next stop (crater/volcano) · back to class · later no-hint check · honest parent view · tap-to-talk + typing · reduced-motion path | **Built, browser-tested (headless)**. Not yet on a real phone. |
| B. Claude brain | Server route calls the Claude API with the current world's facts + tools (`toolsFor()`), streams text; browser speaks it. Key stays server-side. Measure input→first audio. | Not started. Key created (Console workspace `ai-teacher`, $20/month cap); it goes into Vercel env. Needs: Vercel project, model choice. |
| C. Second subject | Prove generality with Gaddi's real homework: **repeated division / equal groups** as a classroom activity (drag objects into groups). Then one history or geography world. | Not started. |
| D. Production characters | Replace the procedural Leo/Mia with rigged GLB characters (face morphs, fingers, real walk). | **Decision needed** (asset purchase or commission). See CHECKPOINT. |
| E. Accounts + memory | Supabase auth, parent accounts, learner evidence with RLS, delete/export. Replaces local demo storage. | Not started. |
| F. Assignment upload | Photo/PDF of homework → identify the skill → lesson. Uploads are untrusted content. | Not started. |
| G. Private test deploy | HTTPS deploy (Vercel) so the Android phone can be tested; device checklist. | Not started. |

## Acceptance for Stage A (current)
- [x] Child picks Leo or Mia; preview shows them waving and speaking
- [x] Teacher visibly moves: walks, turns, points at real object positions, gestures, helmet on trips
- [x] A scene command visibly changes the 3D world (openWorld → flight → Mars)
- [x] Object interaction changes lesson state (rock tap → explanation → question)
- [x] Wrong answer gets a hint, not praise; attempts and hints recorded
- [x] Later unassisted check on a different question; parent view shows "with a hint" vs "on their own later"
- [x] Interruption: Stop / tap-to-talk / typing stops speech, mouth, walking, pointing; stale actions dropped
- [x] Simulation clearly labelled; helmet; "people need spacesuits" said on arrival
- [x] Reduced-motion: trip becomes a short fade
- [ ] Runs ≥30 fps on the Android phone (Honor X9b) — **needs real device test**
- [ ] Browser voices sound acceptable for Leo (male) / Mia (female) on that phone — **needs listening test**
- [ ] Mars fact set reviewed by a human — **pending**

## Stage B design notes (so nobody rebuilds the engine)
- `Brain` interface (`src/lib/brain/types.ts`) already returns `{ segments: [{ say, actions }] }`. A `ClaudeBrain` returns the same shape.
- Tools come from `toolsFor(contextFor(world))`: the model only ever sees ids the current world declares. Every action is validated again in the controller.
- Facts + sources for the prompt come from the world registry; uploaded or retrieved text is untrusted data, never instructions.
- Latency plan: stream the first sentence as soon as it is complete and speak it while the rest arrives. Measure. If browser TTS is too robotic, evaluate a TTS service separately (cost per minute).
