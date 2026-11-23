import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import { decide, PLANS, TRIAL_MINUTES, turnsForMinutes, isPlanId } from "@/lib/billing/plans";

vi.mock("server-only", () => ({}));
const { verifySignature, mapEvent } = await import("@/lib/billing/freemius");

const NOW = new Date("2026-12-01T00:00:00Z");
const future = "2026-12-10T00:00:00.000Z";
const past = "2026-11-20T00:00:00.000Z";

describe("plans and allowance", () => {
  it("matches the founder's decisions", () => {
    expect(PLANS.solo).toMatchObject({ priceUsd: 29, monthlyMinutes: 600 });
    expect(PLANS.family).toMatchObject({ priceUsd: 79, monthlyMinutes: 2400 });
    expect(TRIAL_MINUTES).toBe(120);
  });
  it("rejects __proto__ style plan ids", () => {
    expect(isPlanId("__proto__")).toBe(false);
    expect(isPlanId("constructor")).toBe(false);
    expect(isPlanId("solo")).toBe(true);
  });
  it("no subscription, refunded, past_due: no access", () => {
    expect(decide(null, 0, NOW)).toEqual({ allowed: false, reason: "no_subscription" });
    expect(decide({ plan: "solo", status: "refunded", periodEnd: future }, 0, NOW)).toMatchObject({ allowed: false, reason: "inactive" });
    expect(decide({ plan: "solo", status: "past_due", periodEnd: future }, 0, NOW)).toMatchObject({ allowed: false, reason: "inactive" });
  });
  it("trial is capped at 2 hours of turns and ends on time", () => {
    const cap = turnsForMinutes(120);
    expect(decide({ plan: "family", status: "trialing", periodEnd: future }, cap - 1, NOW)).toMatchObject({ allowed: true, turnsLeft: 1, capTurns: cap });
    expect(decide({ plan: "family", status: "trialing", periodEnd: future }, cap, NOW)).toMatchObject({ allowed: false, reason: "cap_reached" });
    expect(decide({ plan: "solo", status: "trialing", periodEnd: past }, 0, NOW)).toMatchObject({ allowed: false, reason: "expired" });
    expect(decide({ plan: "solo", status: "trialing", periodEnd: null }, 0, NOW)).toMatchObject({ allowed: false, reason: "expired" });
  });
  it("active plans use their own monthly cap", () => {
    const solo = turnsForMinutes(600), fam = turnsForMinutes(2400);
    expect(decide({ plan: "solo", status: "active", periodEnd: future }, solo, NOW)).toMatchObject({ allowed: false, reason: "cap_reached" });
    expect(decide({ plan: "family", status: "active", periodEnd: future }, solo, NOW)).toMatchObject({ allowed: true });
    expect(decide({ plan: "family", status: "active", periodEnd: future }, fam, NOW)).toMatchObject({ allowed: false });
  });
  it("canceled keeps access only until the paid period ends", () => {
    expect(decide({ plan: "solo", status: "canceled", periodEnd: future }, 0, NOW)).toMatchObject({ allowed: true });
    expect(decide({ plan: "solo", status: "canceled", periodEnd: past }, 0, NOW)).toMatchObject({ allowed: false, reason: "expired" });
  });
  it("garbage usage numbers cannot raise the allowance", () => {
    expect(decide({ plan: "solo", status: "active", periodEnd: future }, -1e9, NOW)).toMatchObject({ allowed: true, capTurns: turnsForMinutes(600), turnsLeft: turnsForMinutes(600) });
    expect(decide({ plan: "solo", status: "active", periodEnd: future }, NaN, NOW)).toMatchObject({ allowed: true });
  });
});

describe("freemius signature", () => {
  const secret = "s".repeat(32);
  const body = JSON.stringify({ type: "subscription.created", id: "1" });
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  it("accepts the right signature", () => expect(verifySignature(body, sig, secret)).toBe(true));
  it("rejects wrong, missing, short-secret, tampered and malformed signatures", () => {
    expect(verifySignature(body, "0".repeat(64), secret)).toBe(false);
    expect(verifySignature(body, null, secret)).toBe(false);
    expect(verifySignature(body, sig, "short")).toBe(false);
    expect(verifySignature(body + " ", sig, secret)).toBe(false);
    expect(verifySignature(body, sig.slice(0, 63), secret)).toBe(false);
    expect(verifySignature(body, "zz".repeat(32), secret)).toBe(false);
  });
});

describe("freemius event mapping (field names UNVERIFIED, see freemius.ts)", () => {
  const base = (type: string, extra: object = {}) => ({
    type, id: "evt_1",
    objects: { user: { id: 7, email: "Parent@Example.com" }, license: { plan_name: "family", expiration: "2026-12-10 00:00:00" }, subscription: { id: 9 }, ...extra },
  });
  it("trial and purchase grant with a known plan", () => {
    expect(mapEvent(base("install.trial.started"))).toMatchObject({ status: "trialing", plan: "family", email: "parent@example.com", periodEnd: "2026-12-10T00:00:00.000Z", freemiusSubscriptionId: "9" });
    expect(mapEvent(base("subscription.created"))).toMatchObject({ status: "active" });
  });
  it("stops map without needing a plan", () => {
    const nop = base("subscription.cancelled", { license: {} });
    expect(mapEvent(nop)).toMatchObject({ status: "canceled", plan: null });
    expect(mapEvent(base("payment.refund", { license: {} }))).toMatchObject({ status: "refunded" });
    expect(mapEvent(base("subscription.renewal.failed", { license: {} }))).toMatchObject({ status: "past_due" });
  });
  it("fails closed: unknown plan, unknown type, bad email, junk", () => {
    expect(mapEvent(base("subscription.created", { license: { plan_name: "enterprise" } }))).toBeNull();
    expect(mapEvent(base("subscription.created", { license: { plan_name: "__proto__" } }))).toBeNull();
    expect(mapEvent(base("nonsense.event"))).toBeNull();
    expect(mapEvent(base("constructor"))).toBeNull();
    expect(mapEvent({ ...base("subscription.created"), objects: { user: { email: "not-an-email" }, license: { plan_name: "solo" } } })).toBeNull();
    for (const j of [null, 1, "x", [], {}, { type: "subscription.created" }]) expect(mapEvent(j)).toBeNull();
  });
});
