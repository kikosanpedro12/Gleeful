import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardView } from "@/app/admin/dashboard/DashboardView";
import { sampleDashboard } from "./helpers/adminFixture";

describe("admin events panels: extreme data", () => {
  const base = sampleDashboard(30);
  const render = (events: NonNullable<typeof base.events>) => renderToStaticMarkup(createElement(DashboardView, { d: { ...base, events } }));
  it("zero signups with non-zero later steps (no NaN, Infinity or negative percentages)", () => {
    const html = render({ ...base.events!, funnel: { signups: 0, consents: 5, learners: 3, active: 9, checkoutClicks: 2 }, retention: { activeToday: 0, active7: 0, active30: 0, quiet: 0, signupsEver: 0 } });
    expect(html).not.toMatch(/NaN|Infinity|undefined|-\d+%/);
  });
  it("huge counts and later steps larger than signups stay finite and escaped", () => {
    const html = render({ ...base.events!, funnel: { signups: 1, consents: 2_000_000, learners: 3, active: 9e9, checkoutClicks: 2 }, sources: [{ name: "<img src=x onerror=alert(1)>", kind: "campaign", count: 2_000_000_000 }], healthTotals: { brainError: 1e9, brainFallback: 0, voiceError: 0 } });
    expect(html).not.toMatch(/NaN|Infinity|undefined/); expect(html).not.toContain("<img src=x");
  });
  it("one-day health series and empty sources render", () => {
    const html = render({ ...base.events!, days: 1, health: [{ date: "2026-11-24", brainError: 0, brainFallback: 0, voiceError: 0 }], sources: [] });
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
  });
});
