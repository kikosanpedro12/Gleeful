# Payment vendors: Freemius vs Dodo Payments (checked 23 Nov 2026; Paddle appeal pending)

Source of the Dodo column: Dodo's official docs and pricing page, read by a research agent. UNVERIFIED = docs silent or conflicting. Freemius column from our earlier research.

| Item | Dodo Payments | Freemius |
|---|---|---|
| Merchant of record (tax) | Yes, files and remits | Yes |
| Fee | 4% + $0.40; +0.5% subscriptions, +1.5% international cards, +3% PayPal/BNPL; refund $1; chargeback $30 | 3.8% + $0.50 + gateway fees |
| Example, $15/month intl card | about $1.30 (8.7%) | about $1.07 plus gateway |
| Philippines | On the accepted-countries list; individual account possible (UNVERIFIED for sole proprietor) | Not verified |
| KYC | Government ID + selfie (Persona), 1-3 business days | Account/identity step in dashboard |
| Payout routes | USD SWIFT, local bank, Payoneer; Wise/PayPal not listed | Not verified |
| Payout schedule | 18th and 4th (weekly on request); reserve possible, size UNVERIFIED | Monthly on the 10th, about 2-month hold |
| Minimum payout | $100 (can lower to $50) | $100 |
| Payout fee | $5 under $1,000; SWIFT $25 (pricing page contradicts itself) | Not known |
| Trial with card | Yes (trial days on product or per checkout; card required by default) | Not verified |
| Webhook signature | Standard Webhooks: headers webhook-id, webhook-timestamp, webhook-signature; HMAC-SHA256 over id.timestamp.body, base64 | HMAC-SHA256 hex in x-signature over raw body |
| Webhook payload docs | Event list complete; schemas empty (only a third-party example) | Unpublished |
| Kids' product / education | Not addressed; AI chatbots "require review"; may decline risky | Acceptable-use rules; pre-launch sales need approval |
| Chargebacks | Liability is ours ($30 + amount) | Not verified |
| Red flags (anecdotal) | Trustpilot 3.3/5 (152), polarized; a few freezes, slow support | Not assessed |

## Integration effort if we add Dodo
Replace the signature check with Standard Webhooks (small), map events from REAL sandbox payloads (subscription.active with trial_period_days > 0 = trial start; renewed; payment.failed / past_due / on_hold; cancelled; refund.succeeded), and use Dodo checkout links or a Checkout Sessions call. DB, gate, usage and admin numbers stay as they are. Dodo test mode works before verification (cards 4242 4242 4242 4242 success, 4000 0000 0000 0341 fails on renewal).

## Questions to send Dodo (compliance@dodopayments.com, support@dodopayments.com) BEFORE committing
1. Is an AI tutor app for K-12 children, bought by parents, approved? Does it fall under "AI content generation / chatbot" review?
2. Can a Philippines individual or sole proprietor (no corporation) be approved? Which documents?
3. Which PH payout routes exist (local bank PHP/USD, SWIFT, Payoneer; Wise or PayPal)? Exact fee per payout?
4. Reserve policy for new merchants (percentage, release time)? Weekly or monthly cycle?
5. Exact webhook events and full JSON samples for trial start, trial-to-paid, cancel during trial?
6. Can checkout be prefilled and locked to the customer e-mail? How do we create a customer-portal link by API?
7. Any refund-policy requirement (e.g. 7-day trial refunds)? Dispute-ratio thresholds that trigger a freeze?
8. What notice is given before live payments or payouts are suspended?

## Recommendation (23 Nov 2026)
Dodo looks better than Freemius on cash flow (about 2 weeks vs about 2 months) and has real trial and webhook support, but fees weigh more on a small subscription, the kids' product is not addressed by their policy, and it is not safe to commit before written answers. Keep the Paddle appeal alive; test Dodo in test mode; do not depend on any single processor until the first real payout lands in the Philippines.
