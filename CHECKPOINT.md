# Checkpoint — updated 2026-11-12

**Phase:** 1 (teacher presence + realtime conversation) — **built, NOT complete**. The live voice milestone is unverified until a real API key is used on real devices.

## Verified (by running it)
- 3D classroom + jointed teacher renders in Chrome, landscape and portrait.
- State changes are visible in the body: idle, listening, thinking, speaking; wave/nod/shrug/etc.; walks to the board; points at real object positions with a highlight ring.
- Interruption in demo mode: Stop button and typed barge-in stop speech state, mouth and pointing; a new turn replaces the old one.
- Scene-command validation, stale-turn dropping, state machine, latency maths: unit tests (27) pass. Browser smoke test: 12/12.
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

## Agent sign-off
Tester: pending · Reviewer: pending

## Blockers for the founder
1. **OpenAI API key** (with a monthly budget limit, suggest $20) in `.env.local` — unblocks the whole live milestone.
2. HTTPS access for the phone test (private Vercel deploy or a tunnel).

## Exact next actions
1. Founder: add key, run `npm run dev`, do the 20-turn test in docs/DEVICE_CHECKLIST.md on laptop, export measurements.
2. Builder: fix whatever the first live session breaks; record real latency/cost here.
3. Then Phase 2: Mars world, validated `openWorld`, rock interaction.

## Before real children or payments (not started)
Parent accounts + consent flow, privacy policy, review of voice-provider terms for child-directed use, data retention/deletion, content safety testing, COPPA/GDPR-K style compliance review.
