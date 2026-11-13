import HeroTrack from "./HeroTrack";
import Taste from "./Taste";
import { AI_NOUN, NOUN } from "./copy";

const STEPS = [
  { title: "Your child asks", body: "Out loud or typed, in their own words. Anything from volcanoes to long division." },
  { title: `The ${NOUN} shows it`, body: `It walks, points and draws on the board, then takes the class somewhere to look closer.` },
  { title: "Your child explores", body: "Tap, pick up and spin things. Answer questions, and get a hint when stuck." },
  { title: "You see what stuck", body: "The parent view separates answers given with help from answers given a day later, alone." },
];

const TODAY = [
  { title: "No child accounts", body: "Parents own every child profile. We ask for a nickname and grade, never a surname, school or birthday." },
  { title: "We don't record audio", body: "We keep no recordings or transcripts of what your child says. When the mic is on, your browser's own speech service turns speech into text, and the start screen says so." },
  { title: "Progress that isn't inflated", body: "A right answer after a hint is never shown as mastery. Only a later, unaided answer counts as learned." },
  { title: `A ${NOUN} on rails`, body: `The ${NOUN} can only take approved actions in worlds we built. It can't open links, browse the web or show outside content.` },
];
const BEFORE_LAUNCH = [
  "Verifiable parental consent, following COPPA, GDPR-K and the Philippine Data Privacy Act",
  "Export or delete your family's data whenever you like",
  `A child-safety test set the live ${AI_NOUN} has to pass`,
  "An independent security review of the live app",
];

const FAQ = [
  { q: `Is the ${NOUN} really AI?`, a: `The demo lesson you can try today is scripted, so you can feel the experience. The live ${AI_NOUN}, built on Anthropic's Claude, is in private testing. When it is switched on, the “Ask the ${NOUN}” box on this page lets you ask it up to three questions; when it is off, that box shows a labelled recorded sample. Every build tells you which one you're talking to.` },
  { q: "What ages is it for?", a: "Kindergarten to grade 12. You set your child's grade (kindergarten is grade 0 in our records), and lessons are pitched to it. Today's demo is one scripted lesson." },
  { q: "Do we need to install anything?", a: "No. It runs in the browser on phones, tablets and laptops. On older devices the trips show as still pictures, and the lesson works the same." },
  { q: "Does it replace school?", a: "No. Gleeful is for curiosity and practice at home, alongside school and alongside you." },
  { q: "How does the free trial work?", a: "At launch you start a 7-day free trial with a card. You're charged on day 8 unless you cancel first, and you can cancel any time. Nothing is charged today." },
  { q: "Are there ads?", a: "No. Gleeful is paid for by families, not advertisers." },
];

export default function Landing() {
  return (
    <div className="lp">
      <a className="lp-skip" href="#main">Skip to content</a>
      <header className="lp-nav">
        <a className="lp-mark" href="/" aria-label="Gleeful home">gleeful</a>
        <nav aria-label="Main">
          <a href="#how">How it works</a>
          <a href="#parents">For parents</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <a className="lp-btn lp-btn-nav" href="/learn">Try the demo</a>
      </header>

      <main id="main">
        <HeroTrack />

        <Taste />

        <section id="how" className="lp-section lp-how" aria-labelledby="how-h">
          <div className="lp-wrap">
            <h2 id="how-h" className="lp-h2">One question, four moments.</h2>
            <ol className="lp-steps">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <span className="lp-step-n" aria-hidden>{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="parents" className="lp-section lp-trust" aria-labelledby="trust-h">
          <div className="lp-wrap">
            <h2 id="trust-h" className="lp-h2">Built for kids. Answerable to parents.</h2>
            <p className="lp-lede">We keep two lists. Something moves to the first one only when it's true.</p>
            <div className="lp-lists">
              <div className="lp-list lp-list-today">
                <h3>True today</h3>
                <ul>
                  {TODAY.map((t) => (
                    <li key={t.title}><strong>{t.title}.</strong> {t.body}</li>
                  ))}
                </ul>
              </div>
              <div className="lp-list lp-list-soon">
                <h3>Before we launch</h3>
                <ul>
                  {BEFORE_LAUNCH.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="lp-section lp-pricing" aria-labelledby="price-h">
          <div className="lp-wrap">
            <h2 id="price-h" className="lp-h2">Prices at launch.</h2>
            <p className="lp-lede">One price in every country, in US dollars. At launch: a 7-day free trial with a card, charged on day 8 unless you cancel. Cancel any time. Payments aren&apos;t switched on yet, so nothing is charged today.</p>
            <div className="lp-plans">
              <article className="lp-plan">
                <h3>Solo</h3>
                <p className="lp-price"><span className="lp-amt">US$29</span> <span className="lp-per">a month</span></p>
                <p>For one child. Up to 10 hours a month with the {AI_NOUN}.</p>
              </article>
              <article className="lp-plan lp-plan-family">
                <h3>Family</h3>
                <p className="lp-price"><span className="lp-amt">US$79</span> <span className="lp-per">a month</span></p>
                <p>For brothers and sisters. Up to 40 hours a month with the {AI_NOUN}, shared.</p>
              </article>
            </div>
          </div>
        </section>

        <section id="faq" className="lp-section lp-faq" aria-labelledby="faq-h">
          <div className="lp-wrap lp-wrap-narrow">
            <h2 id="faq-h" className="lp-h2">Questions parents ask.</h2>
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="try" className="lp-section lp-join" aria-labelledby="join-h">
          <div className="lp-wrap lp-wrap-narrow">
            <h2 id="join-h" className="lp-h2">Come and see it.</h2>
            <p className="lp-lede">The demo lesson is open now: no sign-up, nothing to install. It&apos;s scripted, so you can feel the experience. The live {AI_NOUN} is still in private testing.</p>
            <div className="lp-ctas">
              <a className="lp-btn lp-btn-main" href="/learn" data-testid="cta-demo-final">Try the demo lesson</a>
            </div>
            <p className="lp-join-alt">Read how we handle your child's data in the <a href="/privacy">privacy notice</a>.</p>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-row">
          <p className="lp-mark lp-mark-foot">gleeful</p>
          <nav aria-label="Footer">
            <a href="/learn">Scripted demo</a>
            <a href="/parent">Parent view</a>
            <a href="/privacy">Privacy notice</a>
            <a href="#parents">Safety</a>
          </nav>
          <p className="lp-fine">© 2026 Gleeful. Built in the Philippines for curious kids everywhere.</p>
        </div>
      </footer>
    </div>
  );
}
