import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Landing from "@/components/landing/Landing";

/**
 * Honesty: the server-rendered landing never shows a live AI, a teacher choice or a paywall. Those appear only after
 * the browser has asked GET /api/taste. (The live flow is covered by scripts/landing-smoke.mjs.)
 */
describe("landing classroom: honest first paint", () => {
  const page = renderToStaticMarkup(createElement(Landing));
  it("renders the classroom hero with nothing live, no input and no paywall", () => {
    expect(page).toContain("lp-class");
    expect(page).not.toContain("<input");
    expect(page).not.toContain('data-testid="taste-live"');
    expect(page).not.toContain('data-testid="paywall"');
    expect(page).not.toMatch(/waitlist/i);
  });
  it("links to pricing, FAQ and sign-in, and keeps the money claim honest", () => {
    expect(page).toContain('href="/pricing"');
    expect(page).toContain('href="/faq"');
    expect(page).toContain('data-testid="nav-signin"');
    expect(page).not.toMatch(/US\$\s?\d/); // prices live on /pricing only
  });
});
