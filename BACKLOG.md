# Backlog (the nightly task reads this top to bottom)
Rule: pick the first unblocked item, build it with the agent workflow (tester + reviewer, designer for visuals), push to main, tick it, update CHECKPOINT.md.

## Now
- [x] GLB teachers phase A (21 Nov): Leo and Mia as rigged Tripo characters + 17 clips ON by default since 21 Nov (kill switch NEXT_PUBLIC_CHAR_GLB=0, escape hatch ?rig=procedural), procedural rig is the fallback. Pipeline `scripts/build-characters.mjs`, runtime `src/lib/teacher/glb*.ts`, tests (characters, glbClips, glbAnimator), `npm run smoke:glb`. Awaiting tester/reviewer/designer, then the founder's look at the screenshots.
- [x] Grown-up gate before landing voice (22 Nov, founder approved; branch `grownup-gate`): mic + spoken replies off until a grown-up taps Yes (light check, not age verification). Awaiting tester/reviewer/designer.
- [ ] Gate follow-ups: the same gate for the `/learn` demo mic and voice; designer look at the card at 390x844 and with a screen reader; decide whether a remembered Yes should survive a new tab (today: per tab session).
- [ ] Landing phone polish (designer, 21 Nov): hide the 'pretend picture' card on phone from the FIRST answer on (it covers the board text; today it is hidden only once the paywall shows). 'Mute voice' shows on/off through aria-pressed plus the icon only (the label stays 'Mute voice'): consider a visible on/off cue.
- [x] GLB round 2 (21 Nov): tester bugs (walk/act floor, per-rig smokes, pointAt facing, cache header), reviewer disposal notes, loading line, merged backlog-a11y with a face-safe paywall layout. Awaiting re-check by tester/designer.
- [ ] GLB phase B (needs the founder's decision on the look): turn the flag on after a real-phone test (Honor X9b: fps, memory, load time of 2.5 MB), Mia's trousers colour, a real eating clip + snack prop, face (blendshapes or a texture-swap mouth) if lip movement is wanted, map `cheer`/`bow`/`laugh_01` to new gestures, give the old scroll hero (`HeroScene.tsx`, unmounted) the GLB path or delete it, per-character height and framing tune, ASSET_LICENSES: confirm Tripo animation presets are covered.
- [x] Landing taste live feel + guided arc (21 Nov): mic, spoken replies (ElevenLabs landing pool 5k chars/day, browser-voice fallback), ACT, Stop/voice toggle, model CHOICES replace starter chips, name-in-system-prompt fix, procedural pr_pyramids/pr_palms, grown-up paywall naming the topic. Awaiting tester/reviewer/designer, then commit.
- [ ] Run the taste prompt against the real model (small, capped): 10 questions across maths/animals/history/reading/GMRC + the safety set adapted for /api/taste; check arc, CHOICES, ACT, "are you a real person". Needs Kiko's OK (spend).
- [ ] More procedural props on demand (volcano cone, globe, simple boat, rice terraces) so pictures fit common questions.
- [x] Phase 1 acting out (21 Nov): `act` command (run, jump, eat, sit, clap; swim and climb built but no world allows them yet), per-world `actions` in the registry, procedural overlays in the animator, prompt + scripted "can you jump?", unit tests + `npm run smoke:act`. Awaiting tester/reviewer/designer.
- [ ] Acting phase 2: water scenery (a pool or lake world) so `swim` can be declared; a climbable (ladder, tree, rock wall) so `climb` can be declared; small procedural food props for `eat` (own primitives, no paid assets); a run that travels between spots; designer review of how sit and crouch frame on a phone (legs sit under the choice buttons).
- [ ] ELEVEN_PUBLIC on for the lesson demo (the landing taste now has its own pool, on with the key) → pick real Leo/Mia voices.
- [ ] `tests/evals/` + `npm run evals` (docs/BRAIN_LEARNING.md step 1).
- [x] Figure tiers: 3D character → portrait → name card; napoleon.glb wired as first character (21 Nov). Placement (left/center/right) and view (full/closeup) are validated words; code places. Still open: teacher reacts to the figure, compare two figures, wall/hand placements, portrait tier has no rows yet.
- [x] Tripo batch 1 (17 models: 12 animals/space/nature props tp_*, 5 people) shrunk, licensed, wired. Rizal added (realistic draft, 694 KB). Next batch: driven by what kids ask.
- [ ] Portrait fallback: Wikimedia public-domain files (needs approval to browse), licence rows.

## Next
- [ ] Signed-in sidebar/burger; per-learner lesson summaries table (RLS, tests/db, mutant); privacy/consent update.
- [ ] `brain_signals` aggregates table (after Kiko OKs what is logged).
- [ ] Nightly scheduled task + weekly 5-line report.
- [ ] Phone card vs chalkboard text overlap; scene lighting (designer, shared Stage lights).
- [ ] GitHub Actions gate (typecheck, test, mutate) on every push.

## Kiko only
Console 50/80% alerts, ElevenLabs key spend cap + training opt-out, Honor X9b real-device test, SITE_INDEXING at launch, lawyer review, payments/Vercel Pro.
