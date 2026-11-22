import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Terms of use | Gleeful" },
  description: "The terms for using Gleeful, an AI tutor for children that parents set up and pay for. Plain language, early-access version.",
};

export default function Terms() {
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
          <h1 className="lp-h2">Terms of use</h1>
          <p className="lp-lede">Early-access version, 22 November 2026. These are the rules for using Gleeful. They are written in plain language. A lawyer has not reviewed them yet, and we will update them before real families use Gleeful widely.</p>

          <h2>Who we are</h2>
          <p>Gleeful is an AI tutor for school-age children, run by Kiko Antonio San Pedro as a sole proprietor in the Philippines (&ldquo;Gleeful&rdquo;, &ldquo;we&rdquo;). Contact: <a href="mailto:support@getgleeful.com">support@getgleeful.com</a>.</p>

          <h2>Who can use it</h2>
          <ul>
            <li>Accounts are for parents and legal guardians, who must be 18 or older. Children never have their own account.</li>
            <li>A parent sets up each child&apos;s profile and stays responsible for how a child uses Gleeful. Please be with your child, or nearby, while they use it.</li>
            <li>The free try on our home page needs no account. It is meant for a parent or an older child, and younger children should use it with a grown-up.</li>
          </ul>

          <h2>What Gleeful is, and is not</h2>
          <ul>
            <li>The tutor is an AI. It talks, explains and asks questions. It can be wrong, so please check anything important against a book, a teacher or another reliable source.</li>
            <li>Gleeful is a learning helper. It is not a school, it does not replace a teacher, and we do not promise any grade, test score or learning result.</li>
            <li>Lessons, characters and 3D worlds are pretend and simplified. Where something is simulated, we try to say so on screen.</li>
            <li>It is not for emergencies, or for medical, legal or mental-health help. If a child tells the tutor about something serious, a grown-up should step in.</li>
          </ul>

          <h2>Your account</h2>
          <ul>
            <li>Give us a real email address, keep your sign-in secure, and tell us if you think someone else has used your account.</li>
            <li>You can delete a child&apos;s profile, or ask us to delete your whole account, at any time. See the <a href="/privacy">privacy notice</a> for what is stored and how deletion works.</li>
          </ul>

          <h2>Using it properly</h2>
          <p>Please do not use Gleeful to harm, harass or deceive anyone, to try to break or overload it, to get around its limits or safety rules, to copy or resell it, or to type private details such as full names, addresses or phone numbers into a lesson. We can limit or close an account that does these things.</p>

          <h2>Subscriptions and payments</h2>
          <ul>
            <li>Prices are in US dollars, one price in every country, shown on the <a href="/pricing">pricing page</a>. Payments are not switched on yet, so nothing is charged today.</li>
            <li>When they are, a plan starts with a 7-day free trial that needs a card. Unless you cancel before the trial ends, the first payment is taken on day 8 and then every month.</li>
            <li>You can cancel at any time, and the plan stays active until the end of the period you paid for. Our <a href="/refunds">refund policy</a> covers refunds.</li>
            <li>Plans include a monthly number of hours with the tutor. If a plan has a limit, we will show it before you buy.</li>
            <li>Payments will be handled by a payment provider. We do not store your card details. Taxes such as VAT may be added where the law requires, and will be shown at checkout.</li>
            <li>We will tell you before a price changes for an existing plan.</li>
          </ul>

          <h2>Our content and yours</h2>
          <p>Gleeful&apos;s software, characters, art and lessons belong to us or our licensors, and you may use them only through Gleeful as intended. What a child types or says in a lesson stays theirs, and we use it only as described in the <a href="/privacy">privacy notice</a>.</p>

          <h2>When things go wrong</h2>
          <ul>
            <li>Gleeful is an early-access product, provided &ldquo;as is&rdquo;. It may be unavailable, change, or have bugs, and we may pause or stop features (for example voice or the live AI tutor) at any time, including to protect children or control costs.</li>
            <li>To the extent the law allows, we are not responsible for indirect or consequential losses, or for anything that comes from relying on an AI answer. Nothing here limits rights you have under the law that cannot be limited, including consumer rights where you live.</li>
            <li>If you have a problem, write to us first at <a href="mailto:support@getgleeful.com">support@getgleeful.com</a> and we will try to fix it.</li>
          </ul>

          <h2>Changes and the law</h2>
          <p>We may update these terms. If a change matters, we will tell parents with an account and ask again where the law requires. These terms are governed by the laws of the Philippines, without taking away any consumer protection you have under the law where you live.</p>

          <h2>Contact</h2>
          <p><a href="mailto:support@getgleeful.com">support@getgleeful.com</a></p>
        </div>
      </main>
      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-row">
          <p className="lp-mark lp-mark-foot">gleeful</p>
          <nav aria-label="Footer"><a href="/">Home</a><a href="/privacy">Privacy notice</a><a href="/refunds">Refund policy</a></nav>
          <p className="lp-fine">© 2026 Gleeful.</p>
        </div>
      </footer>
    </div>
  );
}
