# Costs

## Development (one-off / tooling) — spent so far: $0
No assets bought, no services subscribed. Existing Claude subscription only.

## Running cost (per live session) — NOT YET MEASURED
Prices for `gpt-realtime-2.1`, official model page, checked 2026-11-12 (USD per 1M tokens):
text in $4 · cached in $0.40 · text out $24 · audio in $32 · audio out $64.
`gpt-realtime-2.1-mini` (third-party listings, verify on the official page): audio in $10 · audio out $20 · text $0.60 / $2.40.

Rough **unverified** estimate for one 15-minute session (child talks ~4 min, teacher ~5 min; assumes ~600 audio tokens/min in and ~1,200/min out, which must be confirmed from real usage):

| | gpt-realtime-2.1 | -mini |
|---|---|---|
| Per session | ~$0.50–$1.00 | ~$0.15–$0.35 |
| Light (8 sessions/mo) | ~$4–$8 | ~$1–$3 |
| Typical (20/mo) | ~$10–$20 | ~$3–$7 |
| Heavy (60/mo) | ~$30–$60 | ~$9–$21 |

Reading: on the flagship model a heavy user could consume the whole $30 subscription in voice cost alone. Session caps and/or the mini model are likely required. Replace this table with measured numbers from the dev panel ("usage" and "est. cost" rows) after the first live sessions.

Not yet included: hosting, storage, retrieval, support, payment fees, acquisition.

## Spend guards in the build
- `MAX_SESSIONS_PER_HOUR` (server), `NEXT_PUBLIC_MAX_SESSION_MINUTES` (client disconnect), optional `APP_ACCESS_CODE`.
- Also set a hard monthly budget limit in the OpenAI dashboard before the first live test.
