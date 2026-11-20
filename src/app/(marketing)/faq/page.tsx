import type { Metadata } from "next";
import { FAQ } from "@/components/landing/content";

export const metadata: Metadata = { title: "FAQ · Gleeful", description: "Questions parents ask about Gleeful." };

export default function Faq() {
  return (
    <div className="lp">
      <header className="lp-nav"><a className="lp-mark" href="/">gleeful</a><nav aria-label="Main"><a href="/pricing">Pricing</a><a href="/sign-in">Sign in</a></nav><a className="lp-btn lp-btn-nav" href="/">Try free</a></header>
      <main className="lp-section lp-faq" style={{ paddingTop: 120 }}>
        <div className="lp-wrap lp-wrap-narrow">
          <h1 className="lp-h2">Questions parents ask.</h1>
          {FAQ.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
        </div>
      </main>
    </div>
  );
}
