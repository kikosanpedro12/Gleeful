import type { Metadata } from "next";
import { AI_NOUN } from "@/components/landing/copy";

export const metadata: Metadata = { title: "Pricing · Gleeful", description: "Gleeful prices at launch, in US dollars. Payments are not switched on yet." };

export default function Pricing() {
  return (
    <div className="lp">
      <header className="lp-nav"><a className="lp-mark" href="/">gleeful</a><nav aria-label="Main"><a href="/faq">FAQ</a><a href="/sign-in">Sign in</a></nav><a className="lp-btn lp-btn-nav" href="/">Try free</a></header>
      <main className="lp-section lp-pricing" style={{ paddingTop: 120 }}>
        <div className="lp-wrap">
          <h1 className="lp-h2">Prices at launch.</h1>
          <p className="lp-lede">One price in every country, in US dollars. At launch: a 7-day free trial with a card, charged on day 8 unless you cancel. Cancel any time. Payments aren&apos;t switched on yet, so nothing is charged today.</p>
          <div className="lp-plans">
            <article className="lp-plan"><h2>Solo</h2><p className="lp-price"><span className="lp-amt">US$29</span> <span className="lp-per">a month</span></p><p>For one child. Up to 10 hours a month with the {AI_NOUN}.</p></article>
            <article className="lp-plan lp-plan-family"><h2>Family</h2><p className="lp-price"><span className="lp-amt">US$79</span> <span className="lp-per">a month</span></p><p>For brothers and sisters. Up to 40 hours a month with the {AI_NOUN}, shared.</p></article>
          </div>
          <p className="lp-join-alt"><a href="/sign-in">Start the 7-day free trial</a> · <a href="/faq">Questions?</a></p>
        </div>
      </main>
    </div>
  );
}
