# Backlog (the nightly task reads this top to bottom)
Rule: pick the first unblocked item, build it with the agent workflow (tester + reviewer, designer for visuals), push to main, tick it, update CHECKPOINT.md.

## Now
- [ ] ELEVEN_PUBLIC on (set in Vercel; redeploy needs Kiko's passkey) → test spoken answer, pick real Leo/Mia voices.
- [ ] `tests/evals/` + `npm run evals` (docs/BRAIN_LEARNING.md step 1).
- [ ] Figure tiers: 3D character → portrait → name card; napoleon.glb wired as first character (decision 19 Nov: 3D characters; painting only as fallback).
- [ ] Figures batch 1 via Tripo (Rizal, Magellan, Marie Curie, Newton), shrink, licence rows.
- [ ] Portrait fallback: Wikimedia public-domain files (needs approval to browse), licence rows.

## Next
- [ ] Signed-in sidebar/burger; per-learner lesson summaries table (RLS, tests/db, mutant); privacy/consent update.
- [ ] `brain_signals` aggregates table (after Kiko OKs what is logged).
- [ ] Nightly scheduled task + weekly 5-line report.
- [ ] Phone card vs chalkboard text overlap; scene lighting (designer, shared Stage lights).
- [ ] GitHub Actions gate (typecheck, test, mutate) on every push.

## Kiko only
Console 50/80% alerts, ElevenLabs key spend cap + training opt-out, Honor X9b real-device test, SITE_INDEXING at launch, lawyer review, payments/Vercel Pro.
