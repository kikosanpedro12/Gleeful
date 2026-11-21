import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Source guards for the landing taste (the live behaviour is checked in scripts/landing-smoke.mjs and taste-break2.mjs).
 * WCAG 2.2.1 Timing Adjustable: nothing the visitor is reading may be removed, replaced or silenced by a timer.
 * Break these once on purpose (re-add `voice.current.stop()` to showPaywall, or `{muted ? "Voice off" ...}`) and see them fail.
 */
const src = readFileSync("src/components/landing/ClassroomHero.tsx", "utf8");

function fnBody(name: string): string {
  const start = src.indexOf(`function ${name}(`);
  expect(start, `${name} exists`).toBeGreaterThan(-1);
  const open = src.indexOf("{", src.indexOf(")", start));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error("unbalanced");
}

describe("landing taste: timed changes (WCAG 2.2.1)", () => {
  it("the paywall timer only ADDS the card: it never stops audio, never hides the live card", () => {
    const b = fnBody("showPaywall");
    expect(b).toContain("setOver(true)");
    expect(b).not.toMatch(/\.stop\(|tasteSpeaking|setSpeaking|setLines|setUsed/);
  });
  it("the live card stays mounted once the paywall shows (the last answer is not swapped out)", () => {
    expect(src).toMatch(/phase === "live" && teacher && \(!over \|\| lines\.length > 0\)/);
    expect(src).not.toMatch(/phase === "live" && !over && teacher/);
  });
  it("timers are only the 'wait for speech end' beat and the 25 s cap, both ending in showPaywall", () => {
    const timeouts = [...src.matchAll(/setTimeout\(([^,]+),\s*([\d_]+|ms)\)/g)].map((m) => m[1].trim());
    const paywallTimers = timeouts.filter((t) => t === "showPaywall");
    expect(paywallTimers.length).toBe(2);
    expect(src).toContain("paywallSoon(1500)"); // after speech ends (onEnd) or Stop
    expect(src).toMatch(/if \(!voice\.current\) paywallSoon\(5000\)/); // voice off: time to read
  });
  it("the paywall never takes keyboard focus after a live answer", () => {
    expect(src).toContain("ref={lines.length === 0 ? focusOnce : undefined}");
    expect(src).not.toMatch(/ref=\{\(el\) => \{ el\?\.focus/);
  });
});

describe("landing taste: the voice toggle", () => {
  const m = src.match(/<button[^>]*data-testid="taste-mute"[\s\S]*?<\/button>/);
  const btn = m ? m[0] : "";
  const open = btn.slice(0, btn.indexOf(">") + 1);
  it("exposes aria-pressed bound to the muted state", () => {
    expect(btn).not.toBe("");
    expect(open).toContain("aria-pressed={muted}");
  });
  it("has ONE constant visible name: the label never changes with the state (it would read twice with aria-pressed)", () => {
    expect(btn).toContain("Mute voice");
    expect(btn).not.toMatch(/Voice o(n|ff)/);
    expect(open).not.toContain("aria-label"); // the visible words are the accessible name (WCAG 2.5.3)
  });
  it("the state icon is hidden from assistive tech", () => {
    expect(btn).toMatch(/<svg[^>]*aria-hidden/);
  });
});
