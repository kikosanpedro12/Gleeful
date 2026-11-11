# Phase 1 — Teacher presence and realtime conversation

**Biggest risk:** end-of-speech → first meaningful audible reply ≤ ~2 s median / 4 s p95 on an ordinary Android phone, with the 3D scene still ≥ 30 fps. Everything else is buildable; this decides whether the product feels alive.
**First test that resolves it:** 20+ live voice turns on the laptop and 20+ on the phone using the built-in dev panel (`?dev=1`), exported as JSON. See docs/DEVICE_CHECKLIST.md.

| # | Item | Status |
|---|------|--------|
| 1 | Classroom scene, camera framing for desktop + portrait phone | Done (procedural) |
| 2 | Jointed teacher body: idle / listening / thinking / speaking poses, gaze, blinks, brows, walking, pointing at real objects, 6 gestures | Done — **placeholder procedural rig, not production art** |
| 3 | Deterministic conversation state machine with turn IDs + cancellation | Done, unit-tested |
| 4 | Validated scene commands (gesture, pointAt, moveTeacherTo, writeOnBoard); Phase 2 commands refused | Done, unit-tested |
| 5 | Voice provider boundary + OpenAI Realtime (WebRTC) provider + server token route | **Written, NOT verified against the live API** (no key yet) |
| 6 | Demo provider (scripted, labelled, no AI) | Done, browser-tested |
| 7 | Mouth movement from voice loudness | Done — **amplitude only, not lip sync** |
| 8 | Interruption: barge-in, Stop button, typed barge-in | Done in demo; live path unverified |
| 9 | Latency / fps / usage instrumentation + export | Done; **no live numbers yet** |
| 10 | Fallbacks: mic denied, no key, token refused, disconnect, timeout, no WebGL, session cap | Done; live ones unverified |
| 11 | Live measurements on laptop + phone | **Not done — needs API key** |
| 12 | Human check that first audio is meaningful (not filler) | Not done |

## Phase 1 is complete only when
- Items 5, 8, 11, 12 are verified with a real key on both devices and results are recorded in CHECKPOINT.md (including misses).
- Reviewer and tester agents have signed off (docs/AGENT_WORKFLOW.md).

## Stack (changes from the suggested baseline)
- Next.js 16, React 19, TypeScript, Three.js + React Three Fiber 9, Zustand. As suggested.
- **No Drei yet** — nothing needed it. **No Supabase yet** — deferred to Phase 3 to keep the spike small; an optional access code + hourly cap guard the token route meanwhile.
- **Procedural teacher instead of a GLB** for now: owned outright, zero licence risk, proves the controller. The production character is a separate asset decision (see CHECKPOINT.md).
- Model defaults to `gpt-realtime-2.1`; `-mini` is the cost candidate to A/B.
