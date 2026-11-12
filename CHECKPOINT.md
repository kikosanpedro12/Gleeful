# Checkpoint — updated 2026-11-12 (afternoon)

**Stage A (the scripted "wow" slice) is built and browser-tested.** Stage B (Claude brain) and Stage E (Supabase) are designed for, not built. See BUILD_PLAN.md.

## Verified by running it
- **Onboarding:** pick Leo or Mia. Each waves and says hello in a male or female browser voice.
- **The trip:**
  - Classroom walls peel away, stars stream past, Mars grows, and a warm flash brings a landing on the Martian surface.
  - The teacher wears a helmet in space and on Mars. A "Simulation" label shows, and the teacher says people need spacesuits.
  - With reduced motion turned on, the trip is a short fade.
- **Teacher body:** walks, turns, points at the real position of each object (highlight ring), gestures, blinks and looks around. The mouth moves while speaking.
- **Lesson:**
  - "Why is it red?" makes the teacher walk to the rock and invite a tap. The child can pick the rock up and spin it, with a NASA-sourced card.
  - A question follows. A wrong answer gets a hint, not praise.
  - Crater and volcano stops, then back to class for a no-hint recheck.
- **Memory across sessions:**
  - In the next session (Mia this time, since history is kept when the teacher switches), the teacher opens with a no-hint check based on stored evidence.
  - The parent view (/parent) separates "during the lesson", "a few minutes later" and "a later session". Only the last counts as "did it on their own".
- **Interruptions:** Stop, tap-to-talk and typing stop speech, mouth, walking and pointing at once. Stale actions are dropped. A queued arrival line plays about 1.2 s after Stop and never over the child.
- **Fallbacks:** mic blocked or no speech, the browser voice failing (silent timeline keeps the pace), no WebGL (the trip still lands), End or Start mid-trip, tampered local storage.
- **Security:**
  - A strict per-request CSP nonce and security headers. The journey runs with zero CSP violations.
  - The Supabase schema's row-level security was attacked on real Postgres: 42 tests, and 14 of 14 planted holes were caught.
  - Secret scan, pinned dependencies, 0 known vulnerabilities.
- **Tests:** 147 unit/database tests. A 31-step browser journey passes on desktop, phone (390×844) and reduced motion.

## Simulated or placeholder — do not mistake for the product
- **The lesson is scripted, not AI.** Labelled "Scripted lesson · not AI yet". It understands keywords only, and says so for anything off-script.
- **Leo and Mia are procedural placeholders** built from primitives we own. They are not the concept-art quality: no skinned mesh, no facial morphs, no fingers.
- **The mouth follows a synthetic rhythm, not lip sync.** Voices are the device's built-in browser voices.
- **Learning history lives in this browser only.** Supabase is designed and tested but not deployed or wired.
- The Mars terrain, globe and planet are illustrative and generated in code. They are not real maps.
- Mars facts: drafted from NASA Space Place, **pending human review**.

## Not verified yet
- Real Android phone (Honor X9b): fps, voices, speech recognition, touch.
- How the browser voices sound for Leo (male) and Mia (female) on that phone.
- Anything on a hosted Supabase project (Security Advisor, dashboard auth settings).

## Decisions
- Experience first with a scripted brain; Claude API brain next (founder has Console credits). OpenAI dropped (git history at `1b1b029`).
- Mars is one sample. Subjects plug in as data (`src/lib/worlds/registry.ts`) plus a scene registered in `src/components/scene/worlds.ts`.
- Children never get accounts. Parents own learner profiles. Data is minimal: nickname, grade, language and teacher choice only.
- Evidence is honest: a no-hint check in the same session is a "recheck", and only a later-session check counts as independent.

## Agent sign-off (2026-11-12)
- Phase 1 rounds: tester PASS WITH NOTES; reviewer rounds 1–3 → PASS WITH NOTES (all high-severity findings fixed).
- World-system build: tester PASS WITH NOTES (10 bugs found, all fixed and now covered by tests); reviewer PASS WITH NOTES (3 high-severity findings fixed: queued lines released by an interrupt, stuck arrival, no-WebGL trip).
- Security/structure review: **PASS WITH NOTES**, no reachable hole found. Fixed:
  - column-scoped update grants;
  - sequence grants revoked;
  - honest SECURITY.md;
  - Windows-safe scripts;
  - stronger secret scan;
  - test hooks behind a build flag;
  - this file rewritten.
- Hardened-build tester round: see the latest entry in the founder's project notes.

## Blockers for the founder
1. **Real-phone test.** Needs an HTTPS deploy (Vercel) or a tunnel. Run docs/DEVICE_CHECKLIST.md.
2. **GitHub repo** (name + private). Then pin the CI actions to SHAs.
3. **Stage B:** a Claude API key with a monthly spend limit set in the Console. Pick a model after a side-by-side teaching test (Haiku 5.5 vs Sonnet 5.5; docs/COSTS.md).
4. **Production characters:** a decision on buying or commissioning rigged Leo and Mia models (cost to be quoted; nothing bought).
5. **Human review** of the Mars fact set.

## Exact next actions
1. Founder: create the GitHub repo, then I push `main`.
2. Founder: Vercel project (or tunnel), then the phone test.
3. Builder: Stage B Claude brain behind `/api/brain`, with server-side limits.
4. Builder: Stage C second subject, Gaddi's repeated division / equal groups.
5. Founder + builder: Stage E, create the Supabase project, `db push`, advisors, `SupabaseLearnerStore`, parent sign-in.

## Before real children or payments (not started)
See the SECURITY.md checklist: consent (COPPA, GDPR-K, Philippine Data Privacy Act), retention, vendor terms for speech, a content-safety test set, incident process, and an independent review.
