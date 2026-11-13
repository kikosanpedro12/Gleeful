import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Taste from "@/components/landing/Taste";
import Landing from "@/components/landing/Landing";

/**
 * Honesty: the server-rendered page (and the first paint on a phone) is the labelled PREVIEW. The live box exists
 * only after GET /api/taste says a question would really be answered. (The live flow is covered in scripts/landing-smoke.mjs.)
 */
describe("ask-the-tutor box: honest by default", () => {
  const html = renderToStaticMarkup(createElement(Taste));
  it("starts as a labelled Preview with nothing to type into", () => {
    expect(html).toContain('data-testid="taste-preview"');
    expect(html).toMatch(/Preview · a recorded sample, not live/);
    expect(html).not.toContain("<input");
    expect(html).not.toContain('data-testid="taste-live"');
    expect(html).not.toMatch(/Live AI tutor/);
  });
  it("tells the visitor the live tutor is off right now and offers the scripted demo", () => {
    expect(html).toMatch(/isn(&#x27;|')t on right now/);
    expect(html).toContain('href="/learn"');
  });
  it("is on the landing page, and the page copy stays true whether the box is live or not", () => {
    const page = renderToStaticMarkup(createElement(Landing));
    expect(page).toContain('id="taste"');
    expect(page).toMatch(/Ask the tutor one thing/);
    expect(page).not.toMatch(/waitlist/i);
  });
});
