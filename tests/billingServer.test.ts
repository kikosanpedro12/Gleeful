import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { handleBrain, makeDeps, type Deps } from "@/lib/brain/server/handler";
import { MemoryUsageStore } from "@/lib/brain/server/limits";
import type { Subscription } from "@/lib/billing/plans";
import type { BillingStore } from "@/lib/billing/store";
import type { BillingChange } from "@/lib/billing/freemius";

vi.mock("server-only", () => ({}));
vi.mock("postgres", () => ({ default: () => { throw new Error("no real database in unit tests"); } }));
const { handleWebhook } = await import("@/lib/billing/webhook");
const { periodEndFor, ruleFor } = await import("@/lib/billing/store");
const { mapEvent } = await import("@/lib/billing/freemius");
const { decide } = await import("@/lib/billing/plans");
const { entitlementFor } = await import("@/lib/auth/parent");
const { paymentsMode } = await import("@/lib/billing/config");
const { claimsToEmail } = await import("@/lib/auth/parent");
const { summarize } = await import("@/lib/billing/summary");

const SECRET = "freemius-test-secret-0123456789";
const NOW = new Date("2026-12-01T00:00:00Z");
const sign = (body: string, secret = SECRET) => createHmac("sha256", secret).update(body, "utf8").digest("hex");

class FakeStore implements BillingStore {
  subs = new Map<string, Subscription>();
  used = new Map<string, number>();
  events = new Set<string>();
  last = new Map<string, Date>();
  fail = false;
  async lookup(email: string) {
    if (this.fail) throw new Error("db down");
    return { sub: this.subs.get(email) ?? null, usedTurns: this.used.get(email) ?? 0 };
  }
  async apply(c: BillingChange, now: Date) {
    if (this.fail) throw new Error("db down");
    if (this.events.has(c.eventId)) return "duplicate" as const;
    this.events.add(c.eventId);
    const cur = this.subs.get(c.email);
    const last = this.last.get(c.email) ?? null;
    const v = ruleFor(c, cur ? { status: cur.status, lastEventAt: last } : null, now);
    if (v === "ignore") return "ignored" as const;
    this.last.set(c.email, new Date(c.eventAt ?? now.toISOString()));
    if (v === "stop") { this.subs.set(c.email, { ...cur!, status: c.status }); return "applied" as const; }
    this.subs.set(c.email, { plan: c.plan!, status: c.status, periodEnd: c.periodEnd ?? periodEndFor(c, now) });
    return "applied" as const;
  }
  async addTurn(email: string) { this.used.set(email, (this.used.get(email) ?? 0) + 1); }
}

const event = (type: string, over: Record<string, unknown> = {}) => JSON.stringify({
  id: "evt_" + Math.random().toString(36).slice(2), type,
  objects: { user: { id: 11, email: "Mum@Example.com" }, license: { plan_name: "family", expiration: "2026-12-08 00:00:00" }, subscription: { id: 5 } }, ...over,
});
const hook = (body: string, headers: Record<string, string> = {}) =>
  new Request("https://gleeful.test/api/freemius/webhook", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
const D = (store: FakeStore, over: Partial<Parameters<typeof handleWebhook>[1]> = {}) => ({ mode: "sandbox" as const, secret: SECRET, store, now: () => NOW, ...over });

describe("webhook route logic", () => {
  let store: FakeStore;
  beforeEach(() => { store = new FakeStore(); });

  it("is closed while payments are off or no secret is set, and reads nothing", async () => {
    const b = event("install.trial.started");
    expect((await handleWebhook(hook(b, { "x-signature": sign(b) }), D(store, { mode: "off" }))).status).toBe(503);
    expect((await handleWebhook(hook(b, { "x-signature": sign(b) }), D(store, { secret: "" }))).status).toBe(503);
    expect(store.subs.size).toBe(0);
  });
  it("refuses a missing, wrong or short signature before looking at the body", async () => {
    const b = event("install.trial.started");
    for (const h of <Record<string, string>[]>[{}, { "x-signature": "abc" }, { "x-signature": sign(b, "another-secret-0123456789") }, { "x-signature": sign(b + " ") }]) {
      expect((await handleWebhook(hook(b, h), D(store))).status).toBe(401);
    }
    expect(store.subs.size).toBe(0);
  });
  it("a signed trial start grants the trial, keyed by the lower-cased e-mail", async () => {
    const b = event("install.trial.started");
    const r = await handleWebhook(hook(b, { "x-signature": sign(b) }), D(store));
    expect(r.status).toBe(200);
    expect(store.subs.get("mum@example.com")).toMatchObject({ plan: "family", status: "trialing" });
  });
  it("a replayed event changes nothing", async () => {
    const b = event("subscription.created", { id: "evt_fixed" });
    expect(await (await handleWebhook(hook(b, { "x-signature": sign(b) }), D(store))).json()).toMatchObject({ handled: "applied" });
    store.subs.set("mum@example.com", { plan: "family", status: "canceled", periodEnd: null });
    expect(await (await handleWebhook(hook(b, { "x-signature": sign(b) }), D(store))).json()).toMatchObject({ handled: "duplicate" });
    expect(store.subs.get("mum@example.com")?.status).toBe("canceled");
  });
  it("a refund or cancel only changes a subscription that exists; it never creates access", async () => {
    const b = event("payment.refund");
    expect(await (await handleWebhook(hook(b, { "x-signature": sign(b) }), D(store))).json()).toMatchObject({ handled: "ignored" });
    expect(store.subs.size).toBe(0);
  });
  it("unknown or unreadable events are acknowledged and ignored", async () => {
    for (const b of [event("something.else"), JSON.stringify({ type: "install.trial.started" }), JSON.stringify([1, 2]), event("install.trial.started", { objects: { user: { email: "not-an-email" } } }), event("subscription.created", { objects: { user: { email: "a@b.co" }, license: { plan_name: "platinum" } } })]) {
      const r = await handleWebhook(hook(b, { "x-signature": sign(b) }), D(store));
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({ handled: "ignored" });
    }
    expect(store.subs.size).toBe(0);
  });
  it("bad JSON that is correctly signed is a 400; an oversized body is a 413", async () => {
    const b = "{not json";
    expect((await handleWebhook(hook(b, { "x-signature": sign(b) }), D(store))).status).toBe(400);
    const big = "x".repeat(70 * 1024);
    expect((await handleWebhook(hook(big, { "x-signature": sign(big) }), D(store))).status).toBe(413);
  });
  it("a database failure is a 500 (Freemius retries) and leaks nothing", async () => {
    store.fail = true;
    const b = event("install.trial.started");
    const r = await handleWebhook(hook(b, { "x-signature": sign(b) }), D(store));
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toMatch(/db down|example\.com/);
  });
});

describe("periodEndFor", () => {
  const c = (over: Partial<BillingChange>): BillingChange => ({ eventId: "e", type: "t", email: "a@b.co", plan: "solo", status: "trialing", periodEnd: null, eventAt: null, freemiusUserId: null, freemiusSubscriptionId: null, ...over });
  it("uses the event's own date, else 7 days for a trial and 32 for a paid period", () => {
    expect(periodEndFor(c({ periodEnd: "2026-12-30T00:00:00.000Z" }), NOW)).toBe("2026-12-30T00:00:00.000Z");
    expect(periodEndFor(c({}), NOW)).toBe("2026-12-08T00:00:00.000Z");
    expect(periodEndFor(c({ status: "active" }), NOW)).toBe("2027-01-02T00:00:00.000Z");
    expect(periodEndFor(c({ status: "canceled" }), NOW)).toBeNull();
  });
});

describe("entitlementFor (what /api/brain and the voice ask)", () => {
  const store = new FakeStore();
  it("no verified e-mail, no subscription: not entitled", async () => {
    expect((await entitlementFor(null, store, NOW)).entitled).toBe(false);
    expect(await entitlementFor("nobody@x.co", store, NOW)).toMatchObject({ entitled: false, denied: "no_subscription" });
  });
  it("a trial with allowance left is entitled and names where to count turns", async () => {
    store.subs.set("t@x.co", { plan: "solo", status: "trialing", periodEnd: "2026-12-05T00:00:00.000Z" });
    expect(await entitlementFor("t@x.co", store, NOW)).toEqual({ entitled: true, usage: { email: "t@x.co", periodEnd: "2026-12-05T00:00:00.000Z" } });
  });
  it("the 2-hour trial cap stops at 324 turns", async () => {
    store.used.set("t@x.co", 323);
    expect((await entitlementFor("t@x.co", store, NOW)).entitled).toBe(true);
    store.used.set("t@x.co", 324);
    expect(await entitlementFor("t@x.co", store, NOW)).toMatchObject({ entitled: false, denied: "cap_reached" });
  });
  it("fails closed when billing cannot be read", async () => {
    const down = new FakeStore(); down.fail = true;
    expect(await entitlementFor("t@x.co", down, NOW)).toMatchObject({ entitled: false, denied: "billing_unavailable" });
  });
});

describe("paymentsMode", () => {
  it("is off unless exactly sandbox or live", () => {
    expect(paymentsMode({})).toBe("off");
    for (const v of ["", "on", "true", "1", "LIVE ", "sandbox", "live"]) expect(["off", "sandbox", "live"]).toContain(paymentsMode({ PAYMENTS_MODE: v }));
    expect(paymentsMode({ PAYMENTS_MODE: "on" })).toBe("off");
    expect(paymentsMode({ PAYMENTS_MODE: " Live " })).toBe("live");
    expect(paymentsMode({ PAYMENTS_MODE: "sandbox" })).toBe("sandbox");
  });
});

describe("/api/brain gate", () => {
  const KEY = "test-key-not-real-0000";
  const body = { v: 1, learnerId: "learner_1", sessionId: "sess_1", tz: "Asia/Manila", world: "mars", teacher: "leo", session: 1, input: { kind: "text", text: "why is it red?" }, hintsUsed: 0, history: [], skills: [] };
  const post = () => new Request("https://gleeful.test/api/brain", { method: "POST", headers: { "content-type": "application/json", host: "gleeful.test", "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify(body) });
  const ok = () => vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "Iron rusted the rocks." }], usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 }));
  const mk = (parent: Deps["parent"], extra: Partial<Deps> = {}, f = ok()) => ({ f, d: makeDeps({ env: { apiKey: KEY, disabled: false }, parent, usage: new MemoryUsageStore(), fetchImpl: f as unknown as typeof fetch, now: () => 0, log: () => {}, ...extra }) });

  it("not entitled: 402 and the model is never called", async () => {
    const { f, d } = mk(async () => ({ id: "p1", consented: true, entitled: false, denied: "no_subscription" }));
    const r = await handleBrain(post(), d);
    expect(r.status).toBe(402);
    expect(await r.json()).toEqual({ error: "subscription_required" });
    expect(f).not.toHaveBeenCalled();
  });
  it("allowance used: 402 allowance_used", async () => {
    const { d } = mk(async () => ({ id: "p1", consented: true, entitled: false, denied: "cap_reached" }));
    expect(await (await handleBrain(post(), d)).json()).toEqual({ error: "allowance_used" });
  });
  it("billing unreadable: 503, closed", async () => {
    const { f, d } = mk(async () => ({ id: "p1", consented: true, entitled: false, denied: "billing_unavailable" }));
    expect((await handleBrain(post(), d)).status).toBe(503);
    expect(f).not.toHaveBeenCalled();
  });
  it("consent is still checked first", async () => {
    const { d } = mk(async () => ({ id: "p1", consented: false, entitled: true }));
    expect((await handleBrain(post(), d)).status).toBe(403);
  });
  it("entitled: answers and counts exactly one turn against the period", async () => {
    const counted: { email: string; periodEnd: string }[] = [];
    const { d } = mk(async () => ({ id: "p1", consented: true, entitled: true, usage: { email: "m@x.co", periodEnd: "2026-12-05T00:00:00.000Z" } }), { countTurn: async (u) => { counted.push(u); } });
    expect((await handleBrain(post(), d)).status).toBe(200);
    expect(counted).toEqual([{ email: "m@x.co", periodEnd: "2026-12-05T00:00:00.000Z" }]);
  });
  it("a counting failure never fails the lesson", async () => {
    const { d } = mk(async () => ({ id: "p1", consented: true, entitled: true, usage: { email: "m@x.co", periodEnd: "x" } }), { countTurn: async () => { throw new Error("db"); } });
    expect((await handleBrain(post(), d)).status).toBe(200);
  });
  it("billing off (entitled omitted): unchanged behaviour, nothing counted", async () => {
    const counted: unknown[] = [];
    const { d } = mk(async () => ({ id: "p1", consented: true }), { countTurn: async (u) => { counted.push(u); } });
    expect((await handleBrain(post(), d)).status).toBe(200);
    expect(counted).toEqual([]);
  });
});

describe("claimsToEmail", () => {
  it("reads only a well-formed string, lower-cased", () => {
    expect(claimsToEmail({ email: "Mum@Example.COM" })).toBe("mum@example.com");
    for (const bad of [null, {}, { email: 5 }, { email: "nope" }, { email: "a b@c.d" }, { email: "x".repeat(260) + "@c.de" }, "str"]) expect(claimsToEmail(bad)).toBeNull();
  });
});

describe("summarize (what a parent reads)", () => {
  const trial: Subscription = { plan: "solo", status: "trialing", periodEnd: "2026-12-05T00:00:00.000Z" };
  it("no plan: offers the trial, in plain words", () => {
    expect(summarize(null, 0, NOW)).toMatchObject({ headline: "No plan yet", canSubscribe: true });
  });
  it("trial: shows the end date and an estimate of minutes used, labelled as an estimate", () => {
    const r = summarize(trial, 27, NOW);
    expect(r.headline).toBe("Free trial");
    expect(r.detail).toContain("December 5, 2026");
    expect(r.detail).toContain("About 10 of 120 minutes used (an estimate)");
    expect(r.canSubscribe).toBe(false);
  });
  it("trial used up, expired, past due, refunded, cancelled each say what to do", () => {
    expect(summarize(trial, 324, NOW).headline).toBe("Trial time used");
    expect(summarize({ ...trial, periodEnd: "2026-11-01T00:00:00.000Z" }, 0, NOW).headline).toBe("Trial ended");
    expect(summarize({ ...trial, status: "past_due" }, 0, NOW).headline).toMatch(/Payment/);
    expect(summarize({ ...trial, status: "refunded" }, 0, NOW).headline).toBe("Refunded");
    const c = summarize({ plan: "family", status: "canceled", periodEnd: "2026-12-20T00:00:00.000Z" }, 0, NOW);
    expect(c.headline).toBe("Cancelled");
    expect(c.detail).toContain("December 20, 2026");
  });
  it("an active plan shows its own monthly allowance", () => {
    expect(summarize({ plan: "family", status: "active", periodEnd: "2026-12-20T00:00:00.000Z" }, 0, NOW).detail).toContain("of 2400 minutes");
  });
});

describe("ordering and abuse rules (ruleFor)", () => {
  const ch = (over: Partial<BillingChange>): BillingChange => ({ eventId: "e", type: "payment.created", email: "a@b.co", plan: "solo", status: "active", periodEnd: null, eventAt: null, freemiusUserId: null, freemiusSubscriptionId: null, ...over });
  const row = (status: "trialing" | "active" | "past_due" | "canceled" | "refunded", at: string | null = null) => ({ status, lastEventAt: at ? new Date(at) : null });
  it("a stop or an unknown plan never creates access from nothing", () => {
    expect(ruleFor(ch({ status: "refunded" }), null, NOW)).toBe("ignore");
    expect(ruleFor(ch({ plan: null }), null, NOW)).toBe("ignore");
    expect(ruleFor(ch({ type: "subscription.created" }), null, NOW)).toBe("grant");
  });
  it("a late payment or renewal cannot bring back a refunded or cancelled plan", () => {
    expect(ruleFor(ch({ type: "payment.created" }), row("refunded"), NOW)).toBe("ignore");
    expect(ruleFor(ch({ type: "subscription.renewal.completed" }), row("canceled"), NOW)).toBe("ignore");
    expect(ruleFor(ch({ type: "subscription.created" }), row("canceled"), NOW)).toBe("grant"); // a genuinely new purchase
  });
  it("refunded is terminal against later stops too", () => {
    expect(ruleFor(ch({ type: "subscription.cancelled", status: "canceled" }), row("refunded"), NOW)).toBe("ignore");
  });
  it("an event dated before the last one applied is stale", () => {
    expect(ruleFor(ch({ type: "subscription.created", eventAt: "2026-11-01T00:00:00.000Z" }), row("active", "2026-11-02T00:00:00.000Z"), NOW)).toBe("ignore");
    expect(ruleFor(ch({ type: "subscription.created", eventAt: "2026-11-03T00:00:00.000Z" }), row("active", "2026-11-02T00:00:00.000Z"), NOW)).toBe("grant");
  });
  it("a trial start only creates: never downgrades a paying plan or gives a second trial", () => {
    const t = ch({ type: "install.trial.started", status: "trialing" });
    expect(ruleFor(t, null, NOW)).toBe("grant");
    for (const s of ["active", "trialing", "canceled", "refunded", "past_due"] as const) expect(ruleFor(t, row(s), NOW)).toBe("ignore");
  });
  it("a failed payment can be repaired by a later payment", () => {
    expect(ruleFor(ch({ type: "payment.created" }), row("past_due"), NOW)).toBe("grant");
  });
  it("end to end: refund, then a stale retry of the payment, leaves no access", async () => {
    const st = new FakeStore();
    const sub = event("subscription.created", { id: "e1" });
    const refund = event("payment.refund", { id: "e2" });
    const stale = event("payment.created", { id: "e3" });
    for (const b of [sub, refund, stale]) await handleWebhook(hook(b, { "x-signature": sign(b) }), D(st));
    expect(st.subs.get("mum@example.com")?.status).toBe("refunded");
  });
});

describe("mapEvent hardening", () => {
  const base = (over: Record<string, unknown>) => ({ id: "e1", type: "subscription.created", created: "2026-12-01 10:00:00", objects: { user: { email: "a@b.co" }, license: { plan_name: "Solo Plan" } }, ...over });
  it("accepts plan names like 'Solo Plan' and reads the event time", () => {
    expect(mapEvent(base({}))).toMatchObject({ plan: "solo", eventAt: "2026-12-01T10:00:00.000Z" });
    expect(mapEvent(base({ objects: { user: { email: "a@b.co" }, license: { plan_name: "family_monthly" } } }))).toMatchObject({ plan: "family" });
  });
  it("still refuses unknown plans and non-ASCII e-mails", () => {
    expect(mapEvent(base({ objects: { user: { email: "a@b.co" }, license: { plan_name: "Platinum Plan" } } }))).toBeNull();
    expect(mapEvent(base({ objects: { user: { email: "ünï@b.co" }, license: { plan_name: "solo" } } }))).toBeNull();
  });
});

describe("decide: an active plan with no period end is not unlimited", () => {
  it("denies", () => {
    expect(decide({ plan: "solo", status: "active", periodEnd: null }, 0, NOW)).toEqual({ allowed: false, reason: "expired" });
  });
});

describe("claimsToEmail: unconfirmed addresses never match", () => {
  it("email_verified false is refused", () => {
    expect(claimsToEmail({ email: "a@b.co", email_verified: false })).toBeNull();
    expect(claimsToEmail({ email: "a@b.co", email_verified: true })).toBe("a@b.co");
  });
});

describe("check-secrets covers the billing variables", () => {
  it("flags public-prefixed Freemius and billing-database names", async () => {
    const { readFileSync } = await import("node:fs");
    const m = readFileSync("scripts/check-secrets.mjs", "utf8").match(/const PUBLIC_SECRET = (\/.*\/);/)!;
    const re = new Function(`return ${m[1]}`)() as RegExp;
    for (const n of ["FREEMIUS_SECRET_KEY", "FREEMIUS_CHECKOUT_URL_SOLO", "BILLING_DATABASE_URL"]) expect(re.test("NEXT_PUBLIC_" + n), n).toBe(true);
  });
});
