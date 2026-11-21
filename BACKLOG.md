# Backlog (the nightly task reads this top to bottom)
Rule: pick the first unblocked item, build it with the agent workflow (tester + reviewer, designer for visuals), push to main, tick it, update CHECKPOINT.md.

## Now
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
