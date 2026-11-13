import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Privacy notice | Gleeful" },
  description: "What Gleeful collects, why, how parental consent works and how to have your family's data deleted. Plain language, early-access version.",
};

const COLLECTED = [
  "Your child's nickname, grade (kindergarten is grade 0), language and chosen teacher. Never a surname, birth date, school, photo or location.",
  "What happened in a lesson: which questions were asked and answered, whether a hint helped, and when. This feeds the parent view.",
  "A parent's sign-in email, once parent accounts exist. They are not switched on yet.",
];

export default function Privacy() {
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
          <h1 className="lp-h2">Privacy notice</h1>
          <p className="lp-lede">Early-access version, 13 November 2026. Gleeful is a test product, so this says what is true today and what we must finish before real families use it.</p>

          <h2>Today</h2>
          <ul>
            <li>The demo lesson at /learn is scripted and needs no account. This website collects no personal data from visitors: there is no sign-up, waitlist or tracking form yet.</li>
            <li>We do not record or store audio or transcripts of what a child says.</li>
            <li>If the child turns the microphone on, their own browser's speech service turns speech into text. That service belongs to the browser's maker (for Chrome, Google) and may receive the audio under its own policy. The start screen says so. Typing works instead.</li>
          </ul>

          <h2>What we will collect once accounts exist</h2>
          <ul>{COLLECTED.map((c) => <li key={c}>{c}</li>)}</ul>
          <p>A child's voice and answers are personal data, and we treat them that way. Children never have their own accounts: a parent owns every child profile.</p>

          <h2>Parental consent</h2>
          <p>Before any real child uses Gleeful, a parent or guardian must give verifiable consent, following COPPA (United States), GDPR-K (Europe) and the Philippine Data Privacy Act. That flow is not built yet, so real children should not be using the live product. We are asking a lawyer to confirm the exact method.</p>

          <h2>Deleting your data</h2>
          <p>Once accounts exist, a parent will be able to export or delete the whole family's data at any time. Until then there is nothing stored to delete.</p>

          <h2>Payments</h2>
          <p>Payments are not switched on. When they are, card details will be handled by a payment provider, never stored by Gleeful.</p>

          <h2>Contact</h2>
          <p>Privacy contact email: to be added before launch.</p>
        </div>
      </main>
      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-row">
          <p className="lp-mark lp-mark-foot">gleeful</p>
          <nav aria-label="Footer"><a href="/">Home</a><a href="/learn">Scripted demo</a></nav>
          <p className="lp-fine">© 2026 Gleeful.</p>
        </div>
      </footer>
    </div>
  );
}
