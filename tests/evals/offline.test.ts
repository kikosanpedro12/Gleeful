import { afterAll, describe, expect, it } from "vitest";
import { allResults } from "./run";

const results = allResults();

describe("evals (offline: canned model outputs through the real sanitizers and validators)", () => {
  for (const r of results) {
    it(`[${r.area}] ${r.id}${r.note ? `  (${r.note})` : ""}`, () => {
      expect(r.problems, r.problems.join("; ")).toEqual([]);
    });
  }
  it("ids are unique", () => {
    const ids = results.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  afterAll(() => {
    const by = new Map<string, { pass: number; fail: number }>();
    for (const r of results) { const a = by.get(r.area) ?? { pass: 0, fail: 0 }; r.pass ? a.pass++ : a.fail++; by.set(r.area, a); }
    const gaps = results.filter((r) => r.note?.startsWith("KNOWN GAP")).length;
    console.log("\nEVAL SUMMARY\n" + [...by].map(([a, v]) => `  ${a.padEnd(9)} ${String(v.pass).padStart(4)} pass ${String(v.fail).padStart(3)} fail`).join("\n") + `\n  known gaps tracked: ${gaps}`);
  });
});
