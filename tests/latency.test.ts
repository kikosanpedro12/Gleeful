import { describe, expect, it } from "vitest";
import { percentile, summarize, toResult, type TurnResult } from "@/lib/telemetry/latency";
import { FrameMeter } from "@/lib/telemetry/frames";

describe("latency", () => {
  it("measures from actual utterance end, and reports VAD wait separately", () => {
    const r = toResult({ turnId: 1, mode: "live", input: "voice", cold: false, utteranceEnd: 1000, vadEnd: 1600, firstAudio: 2900, firstAnimation: 2950 });
    expect(r).toMatchObject({ endToAudioMs: 1900, vadToAudioMs: 1300, vadDelayMs: 600, endToAnimationMs: 1950, outcome: "ok" });
  });
  it("falls back to detector end when the mic estimate is missing", () => {
    expect(toResult({ turnId: 1, mode: "live", input: "voice", cold: false, vadEnd: 500, firstAudio: 1500 }).endToAudioMs).toBe(1000);
  });
  it("classifies failed and interrupted turns", () => {
    expect(toResult({ turnId: 1, mode: "live", input: "text", cold: false, textSubmit: 0 }).outcome).toBe("failed");
    expect(toResult({ turnId: 1, mode: "live", input: "text", cold: false, textSubmit: 0, interrupted: true }).outcome).toBe("interrupted");
  });
  it("nearest-rank percentiles", () => {
    expect(percentile([], 50)).toBeUndefined();
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(percentile(Array.from({ length: 20 }, (_, i) => i + 1), 95)).toBe(19);
  });
  const mk = (ms: number, mode: "live" | "demo" = "live", cold = false): TurnResult => ({ turnId: 0, mode, input: "voice", cold, endToAudioMs: ms, outcome: "ok" });
  it("refuses a verdict without enough live samples, and never from demo data", () => {
    expect(summarize([mk(1000), mk(1200)], "live").meetsTarget).toBeNull();
    expect(summarize(Array.from({ length: 30 }, () => mk(500, "demo")), "demo").meetsTarget).toBeNull();
  });
  it("reports a miss when p95 is over 4 s even if the median is fine", () => {
    const rs = [...Array.from({ length: 18 }, () => mk(1500)), mk(5000), mk(6000)];
    const s = summarize(rs, "live");
    expect(s.medianMs).toBe(1500);
    expect(s.meetsTarget).toBe(false);
    expect(s.overTarget).toBe(2);
  });
  it("counts failures and separates warm turns", () => {
    const rs: TurnResult[] = [mk(3000, "live", true), mk(1000), { turnId: 2, mode: "live", input: "voice", cold: false, outcome: "failed" }];
    expect(summarize(rs, "live").failures).toBe(1);
    expect(summarize(rs, "live", { warmOnly: true }).samples).toBe(1);
  });
});

describe("frame meter", () => {
  it("exposes stalls an average would hide", () => {
    const m = new FrameMeter();
    for (let i = 0; i < 99; i++) m.push(1 / 60);
    m.push(0.4);
    const s = m.stats();
    expect(s.avgFps).toBeGreaterThan(45);
    expect(s.stalls).toBe(1);
    expect(s.longFrames).toBe(1);
    expect(s.low1Fps).toBeLessThan(5);
    expect(s.worstFrameMs).toBe(400);
  });
});
