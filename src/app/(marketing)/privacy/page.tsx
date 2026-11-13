import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Privacy notice | Gleeful" },
  description: "What Gleeful collects, why, how parental consent works and how to have your family's data deleted. Plain language, early-access version.",
};

const COLLECTED = [
  "Your child's nickname, grade (kindergarten is grade 0), language and chosen teacher. Never a surname, birth date, school, photo or location.",
  "What happened in a lesson: which questions were asked and answered, whether a hint helped, and when. This feeds the parent view.",
  "A parent's sign-in email (and, if they choose a password, a password that only the sign-in service can check; we never see it in plain form).",
  "The record of a parent's permission: which version of the wording they agreed to, and when they agreed or withdrew.",
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
            <li>The demo lesson at /learn is scripted and needs no account. A visitor who only tries it gives us no personal data: there is no waitlist, tracking form or advertising.</li>
            <li>Parent accounts exist only where they have been switched on for this site. If the sign-in page says accounts are not available yet, nothing about you is collected.</li>
            <li>When the live &ldquo;Ask the tutor&rdquo; box on the home page is switched on, the question you type there (up to 140 characters, with no account) is sent to Anthropic (the Claude AI service) to write one reply, and Gleeful does not save it. It is meant for a parent or an older child to try, and asks you not to type private details. Your network address is held in the server&apos;s memory for a day only to count how many questions have been asked, and is not stored. When the box is off, the page shows a labelled recorded sample and nothing is sent anywhere.</li>
            <li>We do not record or store audio or transcripts of what a child says.</li>
            <li>If the child turns the microphone on, their own browser's speech service turns speech into text. That service belongs to the browser's maker (for Chrome, Google) and may receive the audio under its own policy. The start screen says so. Typing works instead.</li>
          </ul>

          <h2>What we collect when a parent has an account</h2>
          <ul>{COLLECTED.map((c) => <li key={c}>{c}</li>)}</ul>
          <p>A child's voice and answers are personal data, and we treat them that way. Children never have their own accounts: a parent owns every child profile. Voice is not collected by Gleeful in this version.</p>
          <p>Accounts and profiles are stored with Supabase (database and sign-in), and the site is hosted on Vercel. When the AI tutor is on for a signed-in parent who has given permission, what the child types or taps in a lesson is sent to Anthropic (the Claude AI service) to write the tutor&apos;s reply. Gleeful does not save those messages.</p>

          <h2>Parental consent</h2>
          <p>A parent must read and agree to a plain-language permission before adding a child or before the AI tutor answers that family. They can withdraw it at any time in the parent area, which turns the AI tutor off for them. The wording is versioned, and a change to it asks for permission again.</p>
          <p>This is early-access wording and has not yet been reviewed by a lawyer. Before real families use Gleeful widely we will have a lawyer confirm that this method satisfies COPPA (United States), GDPR-K (Europe) and the Philippine Data Privacy Act, and we will tighten it if they say it does not.</p>

          <h2>Deleting your data</h2>
          <p>In the parent area a parent can edit a child, or delete a child, which deletes that child&apos;s lesson history. Deleting a whole parent account deletes everything under it, including the permission record. A button for deleting the account and for exporting data in one step is not built yet. Until it is, ask us at the contact below and we will do it. Lesson history kept only in a browser can be cleared from the parent area on that device.</p>

          <h2>Payments</h2>
          <p>Payments are not switched on. When they are, card details will be handled by a payment provider, never stored by Gleeful.</p>

          <h2>Contact</h2>
          <p>Privacy contact email: <a href="mailto:kikosanpedro12@gmail.com">kikosanpedro12@gmail.com</a>.</p>
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
