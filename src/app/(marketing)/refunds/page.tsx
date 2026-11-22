import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Refund policy | Gleeful" },
  description: "How the free trial, cancelling and refunds work for Gleeful subscriptions. Plain language, early-access version.",
};

export default function Refunds() {
  return (
    <div className="lp">
      <a className="lp-skip" href="#main">Skip to content</a>
      <header className="lp-nav">
        <a className="lp-mark" href="/" aria-label="Gleeful home">gleeful</a>
        <nav aria-label="Main"><a href="/">Home</a></nav>
        <a className="lp-btn lp-btn-nav" href="/learn">Try the demo</a>
      </header>
      <main id="main" className="lp-section">
        <div className="lp-wrap lp-wrap-narrow">
          <h1 className="lp-h2">Refund policy</h1>
          <p className="lp-lede">Early-access version, 22 November 2026. Payments are not switched on yet, so nothing is charged today. This is how it will work when they are.</p>

          <h2>The free trial</h2>
          <ul>
            <li>Every plan starts with a 7-day free trial. A card is needed to start it.</li>
            <li>If you cancel before the trial ends, you pay nothing.</li>
            <li>If you do not cancel, the first payment is taken on day 8.</li>
          </ul>

          <h2>Cancelling</h2>
          <p>You can cancel at any time. Your plan stays active until the end of the period you have paid for, and then does not renew. We will not charge you again after you cancel.</p>

          <h2>Refunds</h2>
          <ul>
            <li><strong>First payment:</strong> if you were charged and did not mean to continue, tell us within 7 days of the payment and we will refund it in full.</li>
            <li><strong>Later payments:</strong> these are not refunded just because the month has passed. Cancel any time to stop the next one. If something was wrong, write to us within 7 days and we will look at it fairly.</li>
            <li><strong>Something went wrong on our side</strong> (for example, Gleeful was unavailable for a long time, or you were charged twice): we will refund the affected payment.</li>
            <li>Where the law where you live gives you a longer or stronger right to a refund, that right applies.</li>
          </ul>

          <h2>How to ask</h2>
          <p>Email <a href="mailto:support@getgleeful.com">support@getgleeful.com</a> from the address on your account, and tell us roughly when you were charged. Refunds go back to the original payment method and can take several days to appear, depending on your bank.</p>

          <h2>Questions</h2>
          <p>See the <a href="/terms">terms of use</a> and the <a href="/pricing">pricing page</a>, or write to the address above.</p>
        </div>
      </main>
      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-row">
          <p className="lp-mark lp-mark-foot">gleeful</p>
          <nav aria-label="Footer"><a href="/">Home</a><a href="/terms">Terms of use</a><a href="/privacy">Privacy notice</a></nav>
          <p className="lp-fine">© 2026 Gleeful.</p>
        </div>
      </footer>
    </div>
  );
}
