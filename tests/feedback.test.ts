import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("postgres", () => ({ default: () => { throw new Error("no database in unit tests"); } }));
const { parseFeedback, MAX_MESSAGE } = await import("@/lib/feedback/validate");
const { handleFeedback, makeFeedbackLimiter } = await import("@/lib/feedback/handler");
const { estimateMonthlyUsd } = await import("@/lib/billing/stats");

describe("parseFeedback", () => {
  it("accepts a plain message, trims it, lower-cases the e-mail", () => {
    expect(parseFeedback({ message: "  Great app\r\nthanks ", email: " Mum@Example.com ", page: "/feedback" })).toEqual({ message: "Great app\nthanks", contactEmail: "mum@example.com", page: "/feedback" });
    expect(parseFeedback({ message: "hi" })).toEqual({ message: "hi", contactEmail: null, page: null });
    expect(parseFeedback({ message: "hi", email: "" })).toEqual({ message: "hi", contactEmail: null, page: null });
  });
  it("refuses anything else", () => {
    for (const bad of [null, [], "x", 5, {}, { message: 5 }, { message: "   " }, { message: "x".repeat(MAX_MESSAGE + 1) }, { message: "a\u0000b" }, { message: "hi", email: "nope" }, { message: "hi", email: "a b@c.de" }, { message: "hi", page: "https://evil.example" }, { message: "hi", page: "/A?x=1" }, { message: "hi", website: "http://spam" }]) {
      expect(parseFeedback(bad), JSON.stringify(bad)).toBeNull();
    }
  });
  it("allows exactly the maximum", () => { expect(parseFeedback({ message: "x".repeat(MAX_MESSAGE) })).not.toBeNull(); });
});

describe("handleFeedback", () => {
  const post = (body: string, headers: Record<string, string> = {}) => new Request("https://gleeful.test/api/feedback", { method: "POST", headers: { "content-type": "application/json", host: "gleeful.test", "x-forwarded-for": "203.0.113.7", ...headers }, body });
  const mk = (over = {}) => { const saved: unknown[] = []; return { saved, d: { configured: () => true, save: async (f: unknown) => { saved.push(f); return true; }, limiter: makeFeedbackLimiter(), now: () => 0, ...over } }; };
  const ok = JSON.stringify({ message: "It froze on Mars.", email: "a@b.co" });

  it("saves a good message and echoes nothing back", async () => {
    const { saved, d } = mk();
    const r = await handleFeedback(post(ok), d);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(saved).toHaveLength(1);
  });
  it("503 when the database is not connected, and nothing is read", async () => {
    const { saved, d } = mk({ configured: () => false });
    expect((await handleFeedback(post(ok), d)).status).toBe(503);
    expect(saved).toHaveLength(0);
  });
  it("answers 429 when the database-side cap refuses, and strips bidi controls", async () => {
    const { d } = mk({ save: async () => false });
    expect((await handleFeedback(post(ok), d)).status).toBe(429);
    expect(parseFeedback({ message: "a\u202eb" })?.message).toBe("ab");
    expect(parseFeedback({ message: "hi", email: "x,y@b.co" })).toBeNull();
  });
  it("refuses another site, bad JSON, bad shape, a filled honeypot, and an oversized body", async () => {
    const { saved, d } = mk();
    expect((await handleFeedback(post(ok, { origin: "https://evil.example" }), d)).status).toBe(403);
    expect((await handleFeedback(post("{nope"), d)).status).toBe(400);
    expect((await handleFeedback(post(JSON.stringify({ message: "" })), d)).status).toBe(400);
    expect((await handleFeedback(post(JSON.stringify({ message: "hi", website: "x" })), d)).status).toBe(200); // bots see success, nothing is stored
    expect(saved.length).toBe(0);
    expect((await handleFeedback(post("x".repeat(9000)), d)).status).toBe(413);
    expect(saved).toHaveLength(0);
  });
  it("rate-limits one address after 5 in 10 minutes", async () => {
    const { d } = mk();
    for (let i = 0; i < 5; i++) expect((await handleFeedback(post(ok), d)).status).toBe(200);
    const r = await handleFeedback(post(ok), d);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
  });
  it("a save failure is a 500 that leaks nothing", async () => {
    const { d } = mk({ save: async () => { throw new Error("secret db detail a@b.co"); } });
    const r = await handleFeedback(post(ok), d);
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toMatch(/secret|a@b\.co/);
  });
});

describe("estimateMonthlyUsd", () => {
  it("counts only active people at list price", () => {
    expect(estimateMonthlyUsd([{ plan: "solo", status: "active", count: 3 }, { plan: "family", status: "active", count: 2 }, { plan: "solo", status: "trialing", count: 50 }, { plan: "family", status: "refunded", count: 9 }])).toBe(3 * 29 + 2 * 79);
    expect(estimateMonthlyUsd([])).toBe(0);
    expect(estimateMonthlyUsd([{ plan: "solo", status: "trialing", count: 5 }])).toBe(0);
  });
});
