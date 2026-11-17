import { describe, expect, it } from "vitest";
import { loadAll, loadFramework, envFor, coverage, FRAMEWORKS, SOURCES } from "@/lib/curriculum";
import { WORLDS } from "@/lib/worlds/registry";

describe("curriculum data", () => {
  it("every standard has an id, text and an https source; ids are unique", async () => {
    const all = await loadAll();
    expect(all.length).toBeGreaterThan(1800);
    const ids = new Set<string>();
    for (const s of all) {
      expect(s.id && s.text && s.grade && s.subject).toBeTruthy();
      expect(s.src.startsWith("https://")).toBe(true);
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
    }
  });
  it("covers K through 12 for each US framework", async () => {
    for (const fw of ["ccss-math", "ccss-ela", "ngss"] as const) {
      const grades = new Set((await loadFramework(fw)).map((s) => s.grade));
      expect(grades.has("K")).toBe(true);
      expect([...grades].some((g) => g.includes("12") || g.includes("11"))).toBe(true);
    }
  });
  it("DepEd rows come from deped.gov.ph", async () => {
    const d = await loadFramework("deped-matatag");
    expect(d.length).toBeGreaterThan(200);
    expect(d.every((s) => new URL(s.src).hostname.endsWith("deped.gov.ph"))).toBe(true);
  });
  it("unknown framework loads nothing", async () => {
    expect(await loadFramework("__proto__" as never)).toEqual([]);
    expect(FRAMEWORKS.length).toBe(4);
  });
  it("manifest is honest: pending items are labelled", () => {
    expect(SOURCES.some((s) => s.status === "pending")).toBe(true);
  });
});

describe("world mapping", () => {
  it("routes by topic", () => {
    expect(envFor({ subject: "math", domain: "Division", text: "Divide 3-digit numbers" })).toBe("market");
    expect(envFor({ subject: "science", domain: "ESS1", text: "Earth's Place in the Universe" })).toBe("planet_surface");
    expect(envFor({ subject: "weird", domain: "x", text: "y" })).toBe("unmapped");
  });
  it("built environments exist in the world registry", () => {
    const envs = new Set(Object.values(WORLDS).map((w) => w.environment));
    for (const e of ["classroom", "planet_surface", "market"]) expect(envs.has(e as never)).toBe(true);
  });
  it("coverage counts add up and nothing is hidden", async () => {
    const all = await loadAll();
    const c = coverage(all);
    const planned = Object.values(c.planned).reduce((a, b) => a + b, 0);
    expect(c.built + planned + c.unmapped).toBe(c.total);
  });
});

import { curriculumContext } from "@/lib/curriculum/retrieve";
import { buildSystem } from "@/lib/brain/server/prompt";

describe("brain context", () => {
  it("finds related standards and never requires a match", async () => {
    const c = await curriculumContext("how do I add fractions with different denominators");
    expect(c).toMatch(/fraction/i);
    expect(c.split("\n").length).toBeLessThanOrEqual(5);
    expect(await curriculumContext("zzzz qqqq")).toBe("");
    expect(await curriculumContext("")).toBe("");
  });
  it("prompt allows off-lesson learning questions and labels the context as non-limiting", () => {
    const sys = buildSystem({ teacher: "leo", world: "classroom", session: 1, skills: [], history: [], hintsUsed: 0, input: { kind: "session_start" } } as never, "- grade 4 math (x): y");
    expect(sys).toMatch(/Answer any genuine learning question/);
    expect(sys).toMatch(/does not limit what you may answer/);
  });
});

import { SAFETY_RULES } from "@/lib/brain/server/prompt";
describe("safety rules keep every refusal category", () => {
  it.each([
    [/not a learning question/, "non-learning redirect"],
    [/sensitive topics/, "sensitive topics"],
    [/trusted grown-up/, "grown-up handoff"],
    [/personal information|personal data|full name/, "personal info"],
    [/medical, legal, financial/, "medical/legal"],
    [/rules above always win/, "safety wins"],
  ])("%s (%s)", (re) => expect(SAFETY_RULES).toMatch(re));
});
describe("data hygiene", () => {
  it("no markup or instruction phrases in standards; unverified sources are not marked in", async () => {
    const all = await loadAll();
    for (const s of all) { expect(s.text).not.toMatch(/<[a-z/!]|ignore (all |previous)/i); }
    expect(SOURCES.filter((s) => s.id.startsWith("deped-") && s.status === "in")).toEqual([]);
  });
});
