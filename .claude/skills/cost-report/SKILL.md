---
name: cost-report
description: Report what a live teacher minute costs and whether each plan still makes money. Use when Kiko asks about costs, margins, pricing, unit economics, or after a vendor price change.
---

# /cost-report

1. Check prices are current. `config/pricing.json` has a `checked` date. If it is older than 30 days, or the user mentions a vendor price change, look up each vendor's own pricing page (Deepgram, Cartesia, LiveKit, Anthropic) and update the file. Note the new date.
2. Run `node scripts/cost-model.mjs`. It prints cost per minute (unoptimized and optimized) and the margin at each plan's cap.
3. If real usage exists, cost it too:
   - Local: the DevPanel usage counters (tokens, responses) and `aiteacher.results` in the browser.
   - Supabase (Stage E): `select sum(input_tokens), sum(cached_tokens), sum(output_tokens) from public.brain_usage where created_at > now() - interval '30 days'` (server role only; never through the client).
   - Put the totals in a JSON file in the shape shown at the top of `scripts/cost-model.mjs` and run it with `--usage <file>`.
4. Report in five lines or fewer: cost per live minute and per hour, the biggest cost line, any plan under 55% margin at its cap, and what changed since the last report.
5. If a plan drops under 55% at its cap, propose ONE fix: a lower cap, more pre-recorded lines, or a price change. Prices are Kiko's call; never change a live price yourself.
6. When a number changes, update `docs/COSTS.md` and the claude.ai Project doc `claude/09_COSTS.md`.

Rules: label estimates as estimates. Never print API keys or customer data. Never sign up for, or spend on, a vendor without Kiko's approval.
