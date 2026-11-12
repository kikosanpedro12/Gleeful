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

## Spend guards to build in Stage B
- Key only on the server.
- Per-child daily turn cap and per-lesson time cap, enforced on the server.
- Monthly spend limit set in the Claude Console.
- `max_tokens` capped per reply.
