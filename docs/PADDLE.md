# Paddle evaluation for Gleeful (payments)

Researched 2026-11-21 from vendors' own pages (list at the end). Not legal or tax advice: a lawyer/accountant check is still needed. Nothing was signed up for, bought or entered anywhere. Fee maths use `5% + $0.50`, taken from paddle.com/pricing.

## 1. Verdict (one page)

**Paddle is a sound primary choice, conditional on a pre-approval check.** It is a merchant of record (MoR), it lists the Philippines as a supported seller country (not on the sanctions list), it handles tax in 40+ countries including 12% Philippine VAT on B2C digital sales, it supports card-required free trials, hosts a customer portal, and has a clean sandbox, signed webhooks and a Node SDK. Our stack (Next.js on Vercel + Supabase) fits well.

**The blocker to clear before building anything is the Acceptable Use Policy, not the tech.** Paddle's prohibited list has a "content generation" item that includes, as restricted, human-like faces "in realistic, stylized or animated forms", plus "automated categorization of people" and "essay and paper mills, ghostwriting". Gleeful has animated human-like AI teachers (Leo/Mia or a mascot), an AI voice, a learner profile, and a planned homework-upload feature. These are probably fine (we are an education software product, not a face generator), but this is a judgment call by Paddle's review, and a rejection after launch work is costly. **Email Paddle (sellers@paddle.com, the address Paddle gives for questions) with a plain description and screenshots and get written confirmation first.** Fall back to Polar (Philippines is a listed payout country) if Paddle says no.

Other points that matter to us:
- **Fees are 5% + $0.50 per transaction.** At $9/month that is 10.6%; at $29/month 6.7%; annual plans cost about 5.1-5.5%. Our cost model assumes 5% flat (`paymentFeeShare`), which understates monthly plans (see section 3).
- **PHP is not a checkout currency** and not a payout currency. Fine for us: one USD price worldwide. INR is supported (min charge 60.00 INR) but our policy is no regional pricing. Paddle can still auto-convert to local currencies for 33 currencies unless we turn that off (turn it off, or keep it on only if the founder reverses the one-price rule).
- **Payouts**: monthly, minimum $100 of seller fees per month (Terms 7.2), by bank wire or Payoneer. A USD wire to a Philippine bank is a "mismatched currency" wire: Paddle deducts $15, plus intermediary and local bank fees. Payoneer is probably cheaper for a small founder. Confirm in the dashboard.
- **Consumer-law load is mostly carried by Paddle** (California auto-renewal consent checkbox, auto-renewal reminders, trial-end email with portal link), but **we stay responsible for honest marketing, a visible cancel path, and not tricking people**. Our trial design below is built for that.
- **Paddle does not mention children** anywhere in its AUP, seller terms or buyer terms. The buyer is a parent, so Paddle never touches child data. Child-privacy law (COPPA, GDPR-K, Philippine Data Privacy Act) is ours, not Paddle's.

## 2. Comparison (compact)

| | **Paddle Billing** | Stripe (+ Stripe Tax) | Lemon Squeezy | Polar | FastSpring |
|---|---|---|---|---|---|
| Merchant of record | Yes | No. We would be seller of record, register for tax ourselves | Yes (per its model) | Yes | Yes |
| Headline fee | **5% + $0.50 (verified)** | Card fees only (not re-verified); Stripe Tax and tax filing are extra | Not verified (page blocked) | Not verified (page blocked) | Not verified (page blocked) |
| Philippines-based seller | **Supported (verified)** | **Not verified** (stripe.com/global page blocked). Stripe Tax docs say Philippines as business location is "Not supported" for tax calculation | Not verified | Philippines listed as payout country via Stripe Connect Express; individual-type support not confirmed (verified on Polar's page) | Not verified |
| Handles global VAT/GST/US sales tax | Yes, 40+ countries incl. PH 12% B2C (verified) | Calculates only; we register and file | Yes (not verified) | Yes (not verified) | Yes (not verified) |
| Free trial, card on file | Yes (verified) | Yes | Yes (not verified) | Yes (not verified) | Not verified |
| Hosted portal + webhooks + Node SDK | Yes (verified) | Yes | Yes | Yes | Not verified |
| AI / child-edu stance | AUP restricts some AI content generation; silent on children; confirm in writing | Follows card-network rules; no AI category ban (via a third-party article) | AI mention can trigger manual review (third-party article) | Not checked | Not checked |
| Fit for solo founder in PH | **Best on paper, if AUP clears** | Poor unless a US entity (e.g. Stripe Atlas, unverified) and own tax handling | Possible fallback | Possible fallback, cheaper on paper (unverified) | Heavier, sales-led |

Rows marked "not verified" are gaps: those vendor pages were blocked in this session (no permission response), and I did not fill them from memory as facts. Re-check before choosing a fallback.

## 3. Effective fee at our price points

Formula: `fee = 5% x price + $0.50`. Paddle's fee page does not say whether the percentage applies before or after tax; the numbers below use the pre-tax list price (unknown, see risks). The pricing page states no minimum fee and no refund fee; it suggests contacting Paddle for bespoke pricing under $10 products.

| Plan | List price | Paddle fee | Effective % | Net to us |
|---|---|---|---|---|
| Monthly | $9 | $0.95 | **10.56%** | $8.05 |
| Monthly | $19 | $1.45 | **7.63%** | $17.55 |
| Monthly | $29 (Solo) | $1.95 | **6.72%** | $27.05 |
| Monthly | $79 (Family) | $4.45 | **5.63%** | $74.55 |
| Annual at 12x ($108) | $9/mo-equivalent | $5.90 | **5.46%** | $102.10 |
| Annual at 12x ($228) | $19/mo-equivalent | $11.90 | **5.22%** | $216.10 |
| Annual at 12x ($348) | $29/mo-equivalent | $17.90 | **5.14%** | $330.10 |
| Annual at 10x ("2 months free", $290) | $29/mo-equivalent | $15.00 | 5.17% | $275.00 |
| Annual at 12x ($948) | $79/mo-equivalent | $47.90 | 5.05% | $900.10 |

Annual prices are not in `config/pricing.json`; I assumed 12x and 10x of monthly. Worth setting real annual prices.

Extras on top of the headline (all verified except where noted):
- **Payout**: $15 per international wire if payout currency differs from the bank's country (e.g. USD to a PH bank), plus intermediary/local bank fees. Payoneer: Payoneer's own fees. Paddle itself adds "no fees beyond the Paddle fee" on payouts. If payout currency differs from the balance currency, a conversion margin "up to 1.5%" can apply. Keep balance and payout in USD to avoid it.
- **Refunds**: Paddle retains the original processing fee on a refund (help page), and Terms 10.4 let Paddle recover the refund plus its processing fees from us. So a refund costs us the fee too. At $29 a refunded first payment costs $1.95.
- **Chargebacks**: $20 fee (USD/GBP/EUR), not returned even if we win; acceptable rate below 0.65% by value. Even won disputes count.
- **Monthly minimum payout**: $100 of seller fees per month before Paddle pays (Terms 7.2); below it, it rolls over.

Impact on the cost model: `paymentFeeShare` is 0.05. Monthly Solo is really 6.72%, a 1.7 point drop in margin (about $0.50 more per sub per month than the model assumes). Suggested follow-up: `/cost-report` with a fixed $0.50 added per payment instead of a flat 5% (not done here; this file only).

## 4. Integration plan for our stack

### What to build (small, server-side first)
1. **Paddle sandbox account** (separate from live; sandbox domains auto-approved). Products: Solo and Family, each with monthly and annual prices. Trial period set on the price (card-required free trial, 7 days per `PRODUCT_VISION.md`).
2. **Pricing page** (`/pricing`, indexable only if the landing page rules allow) with `@paddle/paddle-js` (`initializePaddle({ environment: "sandbox", token: "test_..." })`), opening the **overlay checkout** with `Paddle.Checkout.open`, passing `customData: { user_id }` and the parent's email. Overlay is the least work and puts payment UI inside Paddle's iframe, so card data never touches our pages. Inline checkout can come later. Checkout is only on the parent side, never in a child's lesson session.
3. **Webhook route** `src/app/api/paddle/webhook/route.ts` (Node runtime, `export const dynamic = "force-dynamic"`): read the raw body with `await req.text()`, verify the `Paddle-Signature` header with `paddle.webhooks.unmarshal(rawBody, secret, signature)` from `@paddle/paddle-node-sdk` (HMAC-SHA256 over `ts:body`; SDK default tolerance 5 seconds), respond 200 within 5 seconds, then write. Do not parse or reformat the body before verifying. The signing secret and API key live server-side only (`import "server-only"`), never in `NEXT_PUBLIC_*`. Only the client-side token (`test_`/`live_`) is public.
4. **Idempotency and order**: Paddle may redeliver and does not guarantee order. Store `event_id` (unique) and ignore repeats; compare `occurred_at` before overwriting state.
5. **Customer portal link**: server action that creates an authenticated portal session (`paddle.customerPortalSessions.create`) and redirects. The portal handles cancel, payment-method update, invoices.
6. **Entitlement check** reads our own table (never the Paddle client token) in the same server code that already enforces caps (`/api/brain`, `/api/tts`).
7. **Optional IP allowlist** at the edge as a second layer; Paddle publishes fixed lists per environment (see sources). Signature check is the primary control.

Events to handle: `subscription.created` (link customer + sub IDs to our user, grant access), `subscription.trialing`, `subscription.activated`/`subscription.updated` (renewals, plan changes, pauses, cancellations; parse the change and adjust), `transaction.completed`, `transaction.payment_failed` (grace), `customer.updated`, plus refund/chargeback adjustment events (`adjustment.*`). Confirm exact event names in the docs while building; I verified `customer.created`, `transaction.completed`, `subscription.created`, `subscription.updated`, `customer.updated`, `subscription.trialing`, `subscription.active`.

### CSP origins for `src/proxy.ts`
**Paddle publishes no CSP list** (the Paddle.js pages say only "always load Paddle.js from https://cdn.paddle.com/"). The list below comes from third-party projects' public notes and must be confirmed in the sandbox with the browser console and `Content-Security-Policy-Report-Only` before shipping.

| Directive | Sandbox | Live | Source |
|---|---|---|---|
| `script-src` | `https://cdn.paddle.com` | `https://cdn.paddle.com` | Paddle docs (script URL `https://cdn.paddle.com/paddle/v2/paddle.js`) |
| `frame-src` | `https://sandbox-buy.paddle.com` | `https://buy.paddle.com` | third-party (GitHub issue, a project PR) |
| `connect-src` | `https://sandbox-checkout-service.paddle.com` | `https://checkout-service.paddle.com` | one third-party PR; unofficial |
| `style-src` | possibly `https://cdn.paddle.com` (a `paddle.css` is reported) | same | one GitHub issue; unconfirmed. One project found it unneeded |
| `img-src`, `font-src` | none expected (checkout renders inside Paddle's iframe) | none | unconfirmed |

Notes specific to our CSP:
- We use `'strict-dynamic'`. CSP3 browsers then ignore host allowlists in `script-src`; Paddle.js runs because our nonced bundle loads it. Keep `https://cdn.paddle.com` in `script-src` as a fallback and for clarity, and make sure the loader runs from our nonced code. This is not a weakening.
- Do not use `unsafe-inline`, do not add `*.paddle.com` wildcards. Add the specific origins, and only for the checkout route (give `buildCsp` an option for `/pricing` rather than allowing Paddle origins app-wide). That keeps `/learn` (the child's session) free of third-party frames.
- Our `frame-ancestors 'none'` stays; it governs our pages, not Paddle's iframe. If we ever switch to inline checkout, no change either.
- Paddle Retain (`public.profitwell.com`, loaded when Retain is on): **leave Retain off**, no extra origin, and no third-party script on pages near children.
- Payment methods such as Apple Pay, Google Pay, PayPal may pull extra origins; test each in the sandbox and add only what the console reports.
- Add a CSP test to `tests/` that asserts the Paddle origins appear only on the checkout route and never on `/learn`.

### Entitlement table (outline, RLS-safe)
Follow `docs/DATABASE.md`: RLS on, explicit grants, tests in `tests/db`, a planted-hole mutant in `scripts/mutate-rls.mjs`.

- `billing_customers`: `user_id` (parent, FK `auth.users`, unique), `paddle_customer_id` (unique), `created_at`. 
- `billing_subscriptions`: `paddle_subscription_id` (PK), `user_id`, `plan` (`solo`/`family`), `interval`, `status` (trialing/active/past_due/paused/canceled), `trial_ends_at`, `current_period_end`, `cancel_at_period_end`, `last_event_at` (`occurred_at` of the last applied event), `updated_at`.
- `billing_events`: `event_id` (PK, idempotency), `event_type`, `occurred_at`, `received_at`, `payload` (jsonb, minimised; no card data exists in Paddle events). 
- `entitlements` (or a view): `user_id`, `plan`, `live_hours_cap`, `kids_max`, `active_until`, derived only from the subscription row.
- Policies: the parent can `select` only their own rows (`user_id = auth.uid()`); **no insert/update/delete grants to `anon` or `authenticated`**. Only the webhook handler writes, using the service role in server-only code. A child profile never gets a billing row. Mutants to plant: a policy that lets `authenticated` update `status`; a missing `user_id` filter; a grant on `billing_events` to `anon`.
- Never trust the browser's "checkout success" callback to grant access; access is granted only from a verified webhook. Show a "confirming payment" state until the entitlement row appears.

### Trial and cancellation flow (honest and consumer-law safe)
Matches `PRODUCT_VISION.md` (2-3 turn taste, then 7-day free trial with card).
1. **The taste** (2-3 turns) needs no card. No payment prompts inside a child's lesson. The parent is asked, in the parent area only.
2. **Parent-only checkout page** (parent account sign-in required; the page says who it is for). Above the button, in plain text: price after trial, trial length, exact first charge date, that it renews automatically monthly/yearly until cancelled, and how to cancel. The US$ price is shown tax-inclusive or exclusive as Paddle settings determine; say which.
3. **Paddle adds its own consent**: for California customers a checkbox stating the amount charged, later charges and where to cancel, for auto-renewing subscriptions including free trials (since 1 July 2025). Paddle also emails before the trial ends with a portal link, and sends renewal reminders in listed US states, the EU countries and the UK for subscriptions of 6 months or longer (annual), 7 or 30 days ahead, not customisable.
4. **We add**: our own reminder email 2 days before the first charge (not a replacement for Paddle's), one-click link to the portal from the parent area, and a visible "Cancel subscription" in the parent area on the same page as the plan, with no phone call or chat needed. Cancelling must not take more steps than signing up.
5. **Cancellation Flows** in the portal can show a survey and a retention offer. Keep it to one optional question and no guilt text. No countdown timers, fake scarcity, or pre-ticked boxes. Default is "cancel confirmed".
6. **Refunds**: state a refund policy on the site and honour statutory windows. Paddle's buyer policy: EU/EEA/UK/Switzerland/Turkey/Israel 14-day withdrawal right (first payment of a subscription; UK annual renewals get a fresh 14 days), 7 days in South Korea, Brazil, China, Canada, and 5 days in Singapore; otherwise discretionary within 14 days at Paddle's discretion. Paddle decides refunds, not us; a refund ends access. Say so on our refund page.
7. **Children**: no purchase buttons, upsells, "ask your parents" nudges, streak-loss threats, or paywall pop-ups in `/learn`. The child sees only "ask your grown-up", with no price. Cap messages like "your free time is up" must be neutral and not shame. Parent-managed profiles stay as in `PRODUCT_VISION.md`.
8. **Trial abuse**: Paddle's docs do not state a one-trial-per-customer rule. Enforce our own: one trial per parent account and per email (and note it in the terms). Do not use child data for this.
9. **Legal state of play** (confirm with a lawyer): the FTC "click-to-cancel" rule was vacated by the Eighth Circuit in July 2025 and the FTC restarted rulemaking in March 2026, but **ROSCA still applies** (clear disclosure of material terms before taking billing information, express informed consent, a simple way to stop charges) as do state auto-renewal laws. The UK DMCC subscription regime (pre-contract info, reminders, 14-day cooling-off, easy exit, covers free trials) is expected from **January 2027** per a law-firm note, with secondary legislation still awaited. EU consumer withdrawal rules apply as listed above.

## 5. Founder onboarding checklist

Do not start until Paddle has said the product is in scope (step 1).

1. [ ] **Pre-approval email** to Paddle describing Gleeful (AI tutor for children bought by parents, animated teacher, AI voice, learner profile, homework upload) and ask directly whether it is in scope under the AUP. Keep the reply.
2. [ ] **Decide the selling entity**: personal (sole proprietor) or a Philippine company. Paddle's terms do not require a company, and they let Paddle ask about the business, shareholders and tax status. Ask an accountant how Paddle payouts are taxed in the Philippines (BIR registration, income tax, any VAT status of the seller). Paddle's tax role covers buyer-side VAT, not our own income tax.
3. [ ] **Documents likely requested** (Paddle's docs say it asks in the dashboard and by email; exact list not published on pages I could read): personal details incl. date of birth and home address, legal business name and address, a website link, a product description, government ID, and business registration if a company. Prepare ID, proof of address, registration (DTI/SEC), bank or Payoneer details.
4. [ ] **Domain**: buy and point the production domain at Vercel (HTTPS). Each host is approved separately (`gleeful.example` and `app.gleeful.example` are two approvals). Submit under Paddle > My account > Settings > Website approval; only one approved domain is needed to proceed. Manual review is typically 5-7 business days.
5. [ ] **Pages on the live site, reachable from navigation**: product description and features, **pricing page** (or a screenshot if not live), **Terms and Conditions** naming the company (or the brand for a sole proprietor), **Privacy Policy**, **Refund Policy**. A parent-facing safety/children page is not required by Paddle but we want it.
6. [ ] **Payout setup**: bank (USD wire, expect a $15 fee) or Payoneer; keep balance and payout currency USD.
7. [ ] **Sandbox first**; then live test with a 100%-discount transaction (Paddle's checklist) before launch.
8. [ ] **Founder rule from `CLAUDE.md`**: no purchases or subscriptions without OK. Paddle has no monthly fee, but the founder signs up himself and approves the legal pages. Never paste API keys in chat.

## 6. Risks and unknowns

| # | Risk / unknown | Level | What to do |
|---|---|---|---|
| 1 | AUP interpretation: animated human-like teacher, AI voice, learner "profile", homework upload could be read as restricted content generation / categorisation of people / ghostwriting | **High until answered** | Written pre-approval (checklist step 1). Marketing copy: "teaches, does not do homework". Keep the real learner-profile language (no labels) |
| 2 | Fixed $0.50 hurts low prices: 10.6% at $9; our model assumes 5% | Medium | Prefer $19+ monthly or push annual; update cost model; ask Paddle for bespoke pricing if volumes come |
| 3 | Refunds and chargebacks cost the fee; chargeback fee $20; threshold 0.65% | Medium | Clear trial messaging, trial-end email, easy cancel (lowers disputes) |
| 4 | Whether the 5% applies to the tax-inclusive total is not stated on the pricing page | Low/Medium | Ask Paddle; check in sandbox |
| 5 | Payout cost for PH (wire $15 + bank fees, or Payoneer fees; $100 monthly minimum) and PH tax treatment of income | Medium | Accountant; compare Payoneer vs wire on first payout |
| 6 | CSP origins not officially published | Medium | Verify in sandbox with report-only CSP; keep Paddle origins to the checkout route |
| 7 | Account suspension or fund retention (Terms 17.2 lets Paddle retain fees for liabilities; termination on 30 days notice or immediately for AUP breach) | Medium | Keep a second provider plan (Polar) and don't hold large balances |
| 8 | Not verified: Stripe availability for PH-based businesses; Lemon Squeezy, Polar and FastSpring fees; whether domain approval time for AI/education is longer; exact one-trial-per-customer behaviour; Paddle-side trial-end email timing | Unknown | Re-check those pages; some were blocked in this session |
| 9 | Law moves: UK subscription regime (Jan 2027 expected), FTC rulemaking, state laws | Medium | Lawyer review before launch (already in the go-live list); keep the cancel path simple, which keeps us ahead of most rules |
| 10 | If we later ship in app stores (Capacitor), Apple/Google may require their own in-app purchase for digital subscriptions; Paddle would then be web-only | Medium (future) | Decide before mobile launch; web checkout is the plan now |
| 11 | Child-privacy obligations are ours (COPPA, GDPR, PH DPA); Paddle only handles the parent's payment data | Medium | Already covered by `SECURITY.md`; keep billing data out of child profiles |
| 12 | Paddle's local VAT page lists the Philippines at 12% B2C. We should check whether Paddle will add VAT to our PH parents' price (tax-inclusive vs exclusive display) | Low | Decide display mode; sandbox test with a PH address |

## 7. Sources (all read 2026-11-21 unless noted)

Vendor pages read:
- Paddle pricing: https://www.paddle.com/pricing (5% + 50c; no monthly fees; under-$10 bespoke)
- What you can't sell on Paddle (via copy at https://paddle.com/support/what-products-am-i-not-allowed-to-sell-on-paddle). The other AUP URLs (`/legal/acceptable-use`, `/legal/acceptable-use-policy`, `/help/start/account-verification/what-am-i-not-allowed-to-sell-on-paddle`) failed to load. **Re-read the official AUP before you apply.**
- Supported seller countries and sanctions list: https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle
- Supported currencies (payment and payout lists): https://developer.paddle.com/concepts/sell/supported-currencies.md
- Supported buyer countries: https://developer.paddle.com/concepts/sell/supported-countries-locales (partial read only)
- Payout fees: https://www.paddle.com/help/manage/get-paid/is-there-a-fee-taken-for-payouts and https://www.paddle.com/help/manage/get-paid/can-i-be-paid-in-my-local-currency
- Seller terms: https://paddle.com/legal/terms (payout threshold 7.2, wire fee 7.5, refund recovery 10.4, retention 17.2, termination 16)
- Buyer refund policy: https://paddle.com/legal/refund-policy
- Buyer terms (renewal, cancel, trial): https://www.paddle.com/legal/checkout-buyer-terms
- Refund how-to: https://www.paddle.com/help/manage/your-customers/how-do-i-issue-refunds ; refund overview https://www.paddle.com/help/manage/your-customers/buyers-refunds
- Chargebacks: https://www.paddle.com/help/manage/risk-prevention/understanding-chargebacks-with-paddle ; retained fees https://developer.paddle.com/changelog/2025/retained-fees-payout-totals.md
- Taxes as MoR: https://www.paddle.com/taxes-fraud-compliance ; countries incl. Philippines 12% VAT: https://paddle.com/help/sell/tax/which-countries-does-paddle-charge-sales-tax-or-vat-for/
- Domain approval: https://www.paddle.com/help/start/account-verification/what-is-domain-approval ; account verification intro: https://www.paddle.com/help/start/account-verification
- Seller onboarding checklist: https://developer.paddle.com/build/onboarding/set-up-checklist
- Trials: https://developer.paddle.com/concepts/subscriptions/trials ; trial requirements https://www.paddle.com/help/start/intro-to-paddle/are-there-any-requirements-for-trial-subscriptions and https://www.paddle.com/help/start/intro-to-paddle/are-my-trial-subscriptions-compliant
- California explicit consent checkbox: https://developer.paddle.com/changelog/2025/explicit-consent-negative-option ; FTC/California notice https://updates.paddle.com/en/ftc-negative-option-rule-compliance-update-_-july-2025-O3wjlYUs
- Auto-renewal reminder locations: https://www.paddle.com/help/manage/your-customers/enhanced-billing-notifications-location-list
- Customer portal: https://developer.paddle.com/concepts/customer-portal
- Localized pricing: https://developer.paddle.com/build/products/offer-localized-pricing
- Webhooks overview: https://developer.paddle.com/webhooks/overview ; signature verification https://developer.paddle.com/webhooks/signature-verification ; delivery, retries and IP lists https://developer.paddle.com/webhooks/respond-to-webhooks
- Paddle.js include/initialize and sandbox env: https://developer.paddle.com/paddle-js/about/ and https://developer.paddle.com/paddle-js/about/include-paddlejs ; sandbox: https://developer.paddle.com/build/tools/sandbox
- Polar payout countries (Philippines listed): https://polar.sh/docs/merchant-of-record/supported-countries.md
- Stripe Tax, Philippines (business location "Not supported"; VAT for remote sellers; 3,000,000 PHP threshold): https://docs.stripe.com/tax/supported-countries/asia-pacific/philippines

Third-party / secondary (treat as unofficial):
- CSP origins: https://github.com/PaddleHQ/paddle-js-wrapper/issues/22 and https://github.com/DLangellotti/targum/pull/1304
- AI-app payment policies article (dated 27 May 2026): https://freemius.com/blog/payment-platform-restrictions-ai-apps/
- FTC rule status (Gibson Dunn, 27 Feb 2026, updated 11 Mar 2026): https://gibsondunn.com/ftc-restarts-negative-option-rulemaking-after-eighth-circuit-vacatur-enforcement-under-rosca-continues/
- UK subscription regime timing (DWF, Oct 2026): https://dwfgroup.com/fr-be/news-and-insights/insights/2026/10/dmcca-subscription-contracts-regime-preparing-for-the-new-restrictions

Pages that were blocked or not readable this session (not used for any claim): stripe.com/global, stripe Connect cross-border payouts, lemonsqueezy.com/pricing, polar.sh/resources/pricing, polar.sh fees doc, fastspring.com/pricing, npmjs.com package page, developer.paddle.com Node SDK pages.
