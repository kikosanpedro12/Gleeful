import "server-only";
import { paymentsMode } from "@/lib/billing/config";
import { pgStore } from "@/lib/billing/store";
import { PLANS } from "@/lib/billing/plans";
import { summarize } from "@/lib/billing/summary";

/** Only https links to Freemius's own checkout/portal hosts are ever rendered, whatever the environment says. */
function safeLink(v: string | undefined): string | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && (u.hostname === "checkout.freemius.com" || u.hostname.endsWith(".freemius.com")) ? u.toString() : null;
  } catch { return null; }
}

/** Parent-area plan and usage. Renders nothing while PAYMENTS_MODE is off. Server component: no billing data reaches the browser except these words. */
export default async function BillingSection({ email }: { email: string | null }) {
  const mode = paymentsMode();
  if (mode === "off") return null;
  let body: ReturnType<typeof summarize> | null = null;
  if (email) {
    try {
      const { sub, usedTurns } = await pgStore.lookup(email);
      body = summarize(sub, usedTurns, new Date());
    } catch { body = null; }
  }
  const solo = safeLink(process.env.FREEMIUS_CHECKOUT_URL_SOLO);
  const family = safeLink(process.env.FREEMIUS_CHECKOUT_URL_FAMILY);
  const portal = safeLink(process.env.FREEMIUS_PORTAL_URL);
  return (
    <section aria-labelledby="plan-h" data-testid="billing">
      <h2 id="plan-h">Plan and time</h2>
      {mode === "sandbox" && <p className="warn" data-testid="billing-sandbox">Test mode: this is for testing the checkout. Only use test cards here.</p>}
      {!body ? (
        <p role="status" data-testid="billing-unavailable">{email ? "We can't check your plan right now, so the live AI teacher is paused. Please try again in a little while." : "Your account has no verified e-mail, so a plan can't be matched to it."}</p>
      ) : (
        <>
          <h3 data-testid="billing-headline">{body.headline}</h3>
          <p data-testid="billing-detail">{body.detail}</p>
          {body.canSubscribe && (
            <>
              <p className="fine">When you check out, use this same e-mail: <b>{email}</b>. We match your plan to it.</p>
              {solo || family ? (
                <p>
                  {solo && <a className="ghost" href={solo} rel="noopener">Solo · US${PLANS.solo.priceUsd}/month · free trial</a>}{" "}
                  {family && <a className="ghost" href={family} rel="noopener">Family · US${PLANS.family.priceUsd}/month · free trial</a>}
                </p>
              ) : <p className="fine">Checkout isn&apos;t connected yet.</p>}
            </>
          )}
          {portal && <p><a href={portal} rel="noopener">Manage or cancel (Freemius)</a></p>}
        </>
      )}
    </section>
  );
}
