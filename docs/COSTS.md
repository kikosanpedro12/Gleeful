# Costs (updated 2026-11-12)

## Development — spent so far: $0
No assets bought, no services subscribed, no API calls made. Existing Claude subscription only.

## Running cost per session, current build: $0
The scripted brain makes no AI calls. Voice uses the browser's built-in speech (free).

## Running cost with a Claude brain (Stage B) — ESTIMATE, NOT MEASURED
Claude API prices checked on the official pricing page, 2026-11-12 (USD per million tokens):

| Model | Input | Output | Cached input |
|---|---|---|---|
| Claude Haiku 5.5 (prompts ≤100k tokens) | $0.10 | $0.50 | $0.01 |
| Claude Sonnet 5.5 | $2 | $10 | $0.10 |

Assumptions for one 15-minute lesson: 40 teacher turns, each with a ~3,000-token prompt (instructions, world facts, tools, recent history) of which ~2,500 are cached, plus ~120 output tokens. Cache writes are ignored. Recheck these against real usage.

| | Haiku 5.5 | Sonnet 5.5 |
|---|---|---|
| Per lesson | ≈ $0.005 | ≈ $0.10 |
| Light use (8 lessons a month) | ≈ $0.04 | ≈ $0.80 |
| Typical use (20 lessons a month) | ≈ $0.10 | ≈ $2 |
| Heavy use (60 lessons a month) | ≈ $0.30 | ≈ $6 |

What this means:
- With text-only Claude plus free browser voices, the brain is a small part of a $30 subscription, even on Sonnet. For comparison, the earlier OpenAI Realtime estimate was ≈ $0.50–$1.00 per lesson.
- The trade-off is voice quality and latency. Browser voices are free but sound robotic on many phones. A paid text-to-speech service would add a per-minute cost; price it before choosing one.
- Which model teaches well enough for Grade 3 has to be tested side by side. A cheap wrong answer is not cheap.

Not yet included: hosting, storage, a TTS service (if needed), support, payment fees, acquisition.

## Full live-voice stack, per live minute — ESTIMATE (2026-11-12)
Run `node scripts/cost-model.mjs` (prices in `config/pricing.json`). Pricing strategy: claude.ai doc "Pricing Strategy — AI Teacher".

| | Unoptimized | Optimized (launch target) |
|---|---|---|
| Ears: Deepgram Flux ($0.0065/min promo) | $0.0065 | $0.0016 (only while the child talks) |
| Mouth: Cartesia Sonic (~775 credits/audio min) | $0.0161 | $0.0080 (half the lines pre-recorded) |
| Pipe: LiveKit ($0.01 + $0.0004/min) | $0.0104 | $0.0010 (own relay) |
| Brain: Haiku 5.5 + 10% Sonnet 5.5 | $0.0010 | $0.0010 |
| **Total** | **$0.034/min ≈ $2.04/hr** | **$0.0117/min ≈ $0.70/hr** |

Plans (one price worldwide): Solo $29 / 10 live hrs (71% margin at cap), Family $79 / 40 live hrs (60%). Unoptimized, Family at its cap loses money, so the cost cuts are launch blockers.

Console: workspace `ai-teacher` has a $20/month dev spend limit (2026-11-12). Raise it at go-live (CHECKPOINT go-live checklist).

## Spend guards to build in Stage B
- Key only on the server.
- Per-child daily turn cap and per-lesson time cap, enforced on the server.
- Monthly spend limit set in the Claude Console.
- `max_tokens` capped per reply.
