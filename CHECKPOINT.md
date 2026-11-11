# Checkpoint — updated 2026-11-12

**Phase:** 1 (teacher presence + realtime conversation) — **built, NOT complete**. The live voice milestone is unverified until a real API key is used on real devices.

## Verified (by running it)
- 3D classroom + jointed teacher renders in Chrome, landscape and portrait.
- State changes are visible in the body: idle, listening, thinking, speaking; wave/nod/shrug/etc.; walks to the board; points at real object positions with a highlight ring.
- Interruption in demo mode: Stop button and typed barge-in stop speech state, mouth and pointing; a new turn replaces the old one.
- Scene-command validation, stale-turn dropping, state machine, latency maths: unit tests pass (68, plus 1 skipped that documents a known limit). Browser smoke test 12/12; tester's break script 14/14.
- Mic-denied path falls back to typing automatically. No-key path falls back to labelled DEMO mode.

## Simulated or placeholder — do not mistake for the product
- **DEMO mode is scripted, not AI.** Browser TTS voice; mouth follows a synthetic envelope; latency figures are simulated and excluded from verdicts.
- **Teacher body is a procedural placeholder** (primitives, owned by us). Not the Leo concept art, no skinned mesh, no facial morph targets, no fingers.
- **Mouth movement is loudness-driven, not lip sync.**
- Mars globe texture is illustrative, not a real map.
- Only Leo exists. No Mia, no voice preview, no Mars world, no rock, no memory, no parent area, no upload, no accounts.

## Written but unverified (needs an OpenAI key)
- Live WebRTC conversation (`src/lib/voice/openaiRealtime.ts`, token route). Built to the docs as read on 2026-11-12. Not confirmed there: `output_audio_buffer.started/stopped` events (code has fallbacks), exact `audio.input` session fields (route retries with a minimal session on a 400), voice name `cedar`.
- Live barge-in, live tool calls, live latency, usage/cost numbers.
- Any real-device fps (headless software rendering only so far).

## Evidence inspected for the brief
Master prompt (full), teacher duo image, storyboard image, and the actual MP4: probed (30 s, 1280×720, 24 fps, H.264 + AAC) and a 12-frame contact sheet extracted and viewed. Audio track not listened to.

## Decisions made
- Procedural teacher now; production character is a later asset decision (options + cost to be presented, nothing bought).
- Supabase deferred to Phase 3; access code + hourly cap guard the token route for now.
- Default model `gpt-realtime-2.1`; A/B `-mini` for cost (docs/COSTS.md).

## Agent sign-off (2026-11-12)
- **Tester — PASS WITH NOTES (demo mode only).** Added 3 test files. Found: late reply adopted by a new turn (high), latency verdict ignoring failures, typed-turn timing overwritten, board-text edge cases. All fixed; its regression tests now pass.
- **Reviewer round 1 — PASS WITH NOTES.** 2 high (Stop while "thinking" did not stop the reply; token route open by default) + 8 medium. All fixed.
- **Reviewer round 2 — BLOCK** on my first fix (two counters could double-count and silence the teacher). Reworked into one tested `ResponseGate` in the provider plus a state check in the controller. **Round 3 review of that rework has not been run yet.**
- Neither agent could test anything live.

## Known issues (not fixed)
- Phone portrait: long board text is clipped at the right edge. Phone landscape: banner/caption cover the teacher.
- While pointing, the teacher turns side-on to the child (reduced, not solved).
- Typing while the mic is mid-utterance can produce two replies in live mode (edge case, unverified).
- Demo mode on loud speakers may hear its own voice and trigger "I heard a sound".
- Session time cap and hourly cap are per browser / per server process, not real enforcement. Proper limits come with accounts in Phase 3.
- After End → Start the teacher stays where he was standing.

## Blockers for the founder
1. **OpenAI API key** (with a monthly budget limit, suggest $20) in `.env.local` — unblocks the whole live milestone.
2. HTTPS access for the phone test (private Vercel deploy or a tunnel).

## Exact next actions
1. Founder: add key, run `npm run dev`, do the 20-turn test in docs/DEVICE_CHECKLIST.md on laptop, export measurements.
2. Builder: fix whatever the first live session breaks; record real latency/cost here.
3. Then Phase 2: Mars world, validated `openWorld`, rock interaction.

## Before real children or payments (not started)
Parent accounts + consent flow, privacy policy, review of voice-provider terms for child-directed use, data retention/deletion, content safety testing, COPPA/GDPR-K style compliance review.
