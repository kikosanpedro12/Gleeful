import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyDashboard, sampleDashboard, sampleFeedback } from "./helpers/adminFixture";
vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({ default: (p: { href: string; children: unknown; "aria-current"?: string }) => createElement("a", { href: p.href, "aria-current": p["aria-current"] }, p.children as string) }));
const { DashboardView, PageHeader } = await import("@/app/admin/dashboard/DashboardView");
const { FeedbackInbox } = await import("@/app/admin/dashboard/FeedbackInbox");
const { delta, niceMax } = await import("@/app/admin/dashboard/format");

describe("admin dashboard (presentational, sample data)", () => {
  it("populated: every panel, the testids, the honest labels", () => {
    const html = renderToStaticMarkup(createElement(DashboardView, { d: sampleDashboard(30) }));
    for (const t of ["stats-mrr", "stats-current", "stats-windows", "panel-customers", "panel-funnel", "panel-usage", "panel-recent", "ESTIMATE", "sandbox", "US$498", "Solo, paying", "m***@example.com", "brake"]) expect(html, t).toContain(t);
    expect(html).not.toContain("chart-empty");
  });
  it("empty: friendly empty states, no invented numbers", () => {
    const html = renderToStaticMarkup(createElement(DashboardView, { d: emptyDashboard(30) }));
    for (const t of ["chart-empty", "No customers yet", "No trials in this period yet", "No one has used their allowance", "Nothing yet."]) expect(html, t).toContain(t);
    expect(html).not.toContain("stats-current");
    expect(html).toContain("US$0");
  });
  it("range control marks the current range", () => {
    const html = renderToStaticMarkup(createElement(PageHeader, { days: 90, updatedIso: "2026-11-24T06:05:00.000Z" }));
    expect(html).toContain('href="/admin?range=7"');
    expect(html).toMatch(/aria-current="true"[^>]*>Last 90 days|href="\/admin\?range=90"[^>]*aria-current="true"|aria-current="true"[^>]*href="\/admin\?range=90"/);
    expect(html).toContain("Manila time");
  });
  it("feedback list renders messages", () => {
    const html = renderToStaticMarkup(createElement(FeedbackInbox, { rows: sampleFeedback }));
    expect(html).toContain("Showing 2 of 2");
  });
  it("delta words: down is bad for trials, up is bad for cancellations", () => {
    expect(delta(3, 5, 30, true).tone).toBe("bad");
    expect(delta(3, 5, 30, false).tone).toBe("good");
    expect(delta(0, 0, 7, true).tone).toBe("flat");
    expect(niceMax(3)).toBe(4); expect(niceMax(37)).toBe(50);
  });
  it("fixture and dev script stay out of src (never shipped)", async () => {
    const { execSync } = await import("node:child_process");
    expect(execSync("grep -rl adminFixture src || true").toString()).toBe("");
  });
});

describe("admin: product events panels (funnel, retention, sources, health)", () => {
  it("populated: every panel, honest labels, no e-mail, the Vercel link", () => {
    const html = renderToStaticMarkup(createElement(DashboardView, { d: sampleDashboard(30) }));
    for (const t of ["panel-signup-funnel", "panel-retention", "panel-sources", "panel-health", "panel-visits", "WEBHOOK EVENTS", "Sent a message to the teacher", "before the reply", "not one group followed over time", "ret-quiet", "sources-table", "health-table", "facebook", "https://vercel.com/gleeful-6f6cb38c/gleeful/analytics", "No campaign tag or referrer"]) expect(html, t).toContain(t);
    expect(html).not.toMatch(/panel-events-note/);
    expect(html).not.toMatch(/<form|<input/);
  });
  it("empty: friendly empty states, still shows the link", () => {
    const html = renderToStaticMarkup(createElement(DashboardView, { d: emptyDashboard(30) }));
    for (const t of ["Nothing in this period yet", "No families tracked yet", "No sign-ups in this period yet", "No errors recorded in this period", "panel-visits"]) expect(html, t).toContain(t);
    expect(html).not.toContain("sources-table");
  });
  it("table missing: says which migration to apply; unreadable: says reload", () => {
    const a = renderToStaticMarkup(createElement(DashboardView, { d: { ...sampleDashboard(30), events: null, eventsNote: "not_applied" } }));
    expect(a).toContain("20261123210909_app_events.sql"); expect(a).toContain("panel-visits"); expect(a).not.toContain("panel-retention");
    const b = renderToStaticMarkup(createElement(DashboardView, { d: { ...sampleDashboard(30), events: null, eventsNote: "unavailable" } }));
    expect(b).toContain("could not be read just now");
  });
});
