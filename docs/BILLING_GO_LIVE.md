# Billing: how it works and what must happen before real money (23 Nov 2026)

Status: built and tested in TEST MODE. `PAYMENTS_MODE` is off, the migration is NOT applied to the live database, and nothing is charged.

## How it works (plain words)
1. A parent signs in, gives permission, and opens **Parent area → Plan and time**.
2. They click a plan. That is a normal link to Freemius's own checkout page (card entry happens on Freemius, never here).
3. Freemius sends our server a signed message (webhook) when the trial starts, a payment is made or fails, or the plan is cancelled or refunded.
4. Our server checks the signature, remembers the plan against the buyer's e-mail, and from then on the live AI teacher only answers while the plan is valid and the month's time is not used up.
5. Time is counted in teacher turns and shown as estimated minutes. Trial: 2 hours over 7 days. Solo: 10 hours a month. Family: 40 hours a month.

## Decision made for you (flag if you disagree)
The app is not allowed to hold Supabase's all-powerful `service_role` key. So the webhook writes through a separate, very narrow database login called `billing_writer`: it can add and update only the three billing tables, cannot delete anything, and cannot see any child or parent data. Alternative was to relax the no-service_role rule; I did not.

## Steps to turn it on for TESTING (sandbox)
1. Apply `supabase/migrations/20261123120000_billing.sql` to the live database (I can do this with the Supabase connector once you say go).
2. Give `billing_writer` a login password (random, 32+ characters) and put the pooler connection string in Vercel as `BILLING_DATABASE_URL`.
3. In Vercel set `FREEMIUS_SECRET_KEY` (Freemius product secret key), `FREEMIUS_CHECKOUT_URL_SOLO` / `_FAMILY` (the hosted checkout links for the two plans), optional `FREEMIUS_PORTAL_URL`, and `PAYMENTS_MODE=sandbox`. NOTE: sandbox mode on the live site also gates real parents (they need a trial to use the live teacher). Use a Vercel preview deployment for testing, or accept that.
4. In Freemius, point the webhook at `https://getgleeful.com/api/freemius/webhook`.
5. Do one sandbox purchase with a Freemius test card. Capture the real webhook body (Freemius dashboard → Webhooks → Events) so we can confirm the field names (`type`, `created`, `objects.user.email`, `objects.license.plan_name`, `expiration`).

## Blockers before PAYMENTS_MODE=live (founder decisions and external steps)
- Confirm the webhook field names against a real sandbox event (the code marks them UNVERIFIED).
- Honesty: selling plans while "full live lessons are in private testing" conflicts with our honesty rule and Freemius's acceptable-use terms. Either live lessons are genuinely available to paying families at launch, or Freemius approves and the product page says exactly what is and isn't included.
- Lawyer review of terms, privacy and parent consent; the "payments are not switched on yet" wording on the site is changed only when payments are truly live (and `tests/tasteArc.test.ts` updated at the same time).
- Freemius payout/identity steps in your account; Vercel Pro (Hobby is non-commercial); the trial copy ("7 days, card required") must match how the Freemius plans are really configured.
- Known limits: a buyer who pays with a different e-mail than their Gleeful account is not matched; usage counts are a brake not a ceiling; the `maxChildren` plan limit (Solo 1, Family 4) is not enforced anywhere yet.
