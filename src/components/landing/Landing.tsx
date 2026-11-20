import ClassroomHero from "./ClassroomHero";
import { STEPS, TODAY } from "./content";
import { NOUN } from "./copy";

export default function Landing() {
  return (
    <div className="lp">
      <a className="lp-skip" href="#main">Skip to content</a>
      <header className="lp-nav">
        <a className="lp-mark" href="/" aria-label="Gleeful home">gleeful</a>
        <nav aria-label="Main">
          <a href="/pricing">Pricing</a>
          <a href="/faq">FAQ</a>
          <a href="/sign-in" data-testid="nav-signin">Sign in</a>
        </nav>
        <a className="lp-btn lp-btn-nav" href="#main" data-testid="nav-try">Try free</a>
      </header>

      <main id="main">
        <ClassroomHero />

        <section id="how" className="lp-section lp-how" aria-labelledby="how-h">
          <div className="lp-wrap">
            <h2 id="how-h" className="lp-h2">Ask. Watch. Explore.</h2>
            <ol className="lp-steps">
              {STEPS.slice(0, 3).map((s, i) => (
                <li key={s.title}><span className="lp-step-n" aria-hidden>{i + 1}</span><h3>{s.title}</h3><p>{s.body}</p></li>
              ))}
            </ol>
          </div>
        </section>

        <section id="parents" className="lp-section lp-trust" aria-labelledby="trust-h">
          <div className="lp-wrap">
            <h2 id="trust-h" className="lp-h2">Built for kids. Answerable to parents.</h2>
            <ul className="lp-trust-list">
              {TODAY.map((t) => <li key={t.title}><strong>{t.title}.</strong> {t.body}</li>)}
            </ul>
            <p className="lp-join-alt">Honest status: payments, parental consent and a safety review come before launch. See the <a href="/privacy">privacy notice</a>.</p>
          </div>
        </section>

        <section id="try" className="lp-section lp-join" aria-labelledby="join-h">
          <div className="lp-wrap lp-wrap-narrow">
            <h2 id="join-h" className="lp-h2">Meet your {NOUN}.</h2>
            <div className="lp-ctas"><a className="lp-btn lp-btn-main" href="#main" data-testid="cta-final">Try it free</a></div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-row">
          <p className="lp-mark lp-mark-foot">gleeful</p>
          <nav aria-label="Footer">
            <a href="/pricing">Pricing</a>
            <a href="/faq">FAQ</a>
            <a href="/privacy">Privacy notice</a>
            <a href="/learn">Scripted demo</a>
            <a href="/parent">Parent view</a>
          </nav>
          <p className="lp-fine">© 2026 Gleeful. Built in the Philippines for curious kids everywhere.</p>
        </div>
      </footer>
    </div>
  );
}
