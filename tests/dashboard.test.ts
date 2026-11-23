import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { shapeSeries, maskEmail, describeChange, parseRange } = await import("@/lib/billing/dashboard");

describe("dashboard data shaping", () => {
  it("fills zero days, splits the range from the previous period, and counts once", () => {
    const rows = [
      { d: "2026-11-24", trials_started: 2, paid: 1, cancelled: 0, refunds: 0, failed: 0 },
      { d: "2026-11-20", trials_started: 1, paid: 0, cancelled: 1, refunds: 0, failed: 1 },
      { d: "2026-11-12", trials_started: 5, paid: 2, cancelled: 0, refunds: 1, failed: 0 }, // previous period for a 7-day range
    ];
    const { series, totals, previous } = shapeSeries(rows, 7, "2026-11-24");
    expect(series).toHaveLength(7);
    expect(series[6]).toMatchObject({ date: "2026-11-24", trialsStarted: 2, paid: 1 });
    expect(series[0].date).toBe("2026-11-18");
    expect(totals).toEqual({ trialsStarted: 3, paid: 1, cancelled: 1, refunds: 0, failed: 1 });
    expect(previous).toEqual({ trialsStarted: 5, paid: 2, cancelled: 0, refunds: 1, failed: 0 });
  });
  it("masks e-mail and names changes in plain words", () => {
    expect(maskEmail("mum@example.com")).toBe("m***@example.com");
    expect(maskEmail("nope")).toBe("unknown");
    expect(describeChange("trialing", null)).toBe("Started a trial");
    expect(describeChange("active", "trialing")).toBe("Trial became paid");
    expect(describeChange("canceled", "trialing")).toBe("Cancelled during trial");
    expect(describeChange("refunded", "active")).toBe("Refunded");
  });
  it("accepts only the offered ranges", () => {
    expect([parseRange("7"), parseRange("90"), parseRange("30"), parseRange("1000"), parseRange("x"), parseRange(undefined), parseRange(["7"])]).toEqual([7, 90, 30, 30, 30, 30, 7]);
  });
});
