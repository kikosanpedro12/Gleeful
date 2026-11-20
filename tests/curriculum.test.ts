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

describe("response modes in the prompt", () => {
  it("tells the brain to pick the format by topic", () => {
    expect(SAFETY_RULES).toMatch(/Pick the format by topic/);
    expect(SAFETY_RULES).toMatch(/no story/);
    expect(SAFETY_RULES).toMatch(/cannot actually show/);
  });
});

import { assetById, checkAssets, MAX_ASSET_KB, MAX_SCENE_KB } from "@/lib/assets/manifest";
describe("asset manifest", () => {
  it("rejects unknown ids and never loads them", () => {
    expect(assetById("__proto__")).toBeUndefined();
    expect(checkAssets(["nope"])).toBe("unknown asset id");
    expect(checkAssets([])).toBeNull();
    expect(MAX_SCENE_KB).toBe(3000);
  });
});

import { ASSETS } from "@/lib/assets/manifest";
import fs from "node:fs";
describe("asset library", () => {
  it("every asset has a file, a licence row, an https source, and a sane size", () => {
    const lic = fs.readFileSync("ASSET_LICENSES.md", "utf8");
    expect(ASSETS.length).toBeGreaterThanOrEqual(20);
    const ids = new Set<string>();
    for (const a of ASSETS) {
      expect(ids.has(a.id)).toBe(false); ids.add(a.id);
      const f = `public/assets/${a.file}`;
      expect(fs.existsSync(f)).toBe(true);
      expect(Math.abs(fs.statSync(f).size / 1024 - a.kb)).toBeLessThan(2);
      expect(a.kb).toBeLessThanOrEqual(1500);
      expect(a.sourceUrl.startsWith("https://")).toBe(true);
      expect(lic.includes(a.file)).toBe(true);
    }
  });
  it("starter set is one look so scenes can combine", () => {
    expect(checkAssets(ASSETS.map((a) => a.id).slice(0, 5))).toBeNull();
  });
});

import { parseFrame, PRETEND_LABEL } from "@/lib/scene/frame";
import { parseSceneCommand } from "@/lib/scene/commands";
import { contextFor } from "@/lib/worlds/registry";

describe("story scene frame", () => {
  const ok = { setting: "study", era: "France, about 1805", props: ["ph_pocket_watch", "ph_marble_bust_01"] };
  it("accepts a valid frame", () => { expect(parseFrame(ok).ok).toBe(true); });
  it("rejects unknown setting, prop, figure, urls and too many props", () => {
    expect(parseFrame({ ...ok, setting: "__proto__" }).ok).toBe(false);
    expect(parseFrame({ ...ok, setting: "constructor" }).ok).toBe(false);
    expect(parseFrame({ ...ok, props: ["https://evil.example/a.glb"] }).ok).toBe(false);
    expect(parseFrame({ ...ok, props: ["nope"] }).ok).toBe(false);
    expect(parseFrame({ ...ok, figure: "napoleon" }).ok).toBe(false);
    expect(parseFrame({ ...ok, props: Array(7).fill("ph_jug_01") }).ok).toBe(false);
    expect(parseFrame({ ...ok, era: "" }).ok).toBe(false);
  });
  it("is a validated command, not while travelling", () => {
    expect(parseSceneCommand("showScene", ok, contextFor("classroom")).ok).toBe(true);
    expect(parseSceneCommand("showScene", ok, contextFor("transit")).ok).toBe(false);
  });
  it("carries the pretend label", () => { expect(PRETEND_LABEL).toMatch(/pretend/i); });
});

import { parseWidget, describeWidget, widgetToArgs } from "@/lib/widgets/spec";
describe("graph widget", () => {
  const g = { widget: "graph", xmin: -5, xmax: 5, ymin: -5, ymax: 5, points: [{ x: 2, y: 3, label: "A" }], lines: [{ m: 2, b: 1 }] };
  it("accepts a valid graph and round-trips", () => {
    const r = parseWidget(g);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(describeWidget(r.spec)).toContain("y = 2x + 1"); expect(parseWidget(widgetToArgs(r.spec)).ok).toBe(true); }
  });
  it("rejects out-of-window points, huge windows, too many items, bad numbers", () => {
    expect(parseWidget({ ...g, points: [{ x: 9, y: 0 }] }).ok).toBe(false);
    expect(parseWidget({ ...g, xmin: -500 }).ok).toBe(false);
    expect(parseWidget({ ...g, xmax: -5 }).ok).toBe(false);
    expect(parseWidget({ ...g, points: Array(7).fill({ x: 0, y: 0 }) }).ok).toBe(false);
    expect(parseWidget({ ...g, lines: Array(3).fill({ m: 1, b: 0 }) }).ok).toBe(false);
    expect(parseWidget({ ...g, lines: [{ m: "x", b: 0 }] }).ok).toBe(false);
    expect(parseWidget({ ...g, lines: [{ m: Infinity, b: 0 }] }).ok).toBe(false);
  });
  it("strips markup from point labels", () => {
    const r = parseWidget({ ...g, points: [{ x: 0, y: 0, label: "<b>hi</b>" }] });
    expect(r.ok && r.spec.kind === "graph" && r.spec.points[0].label).toBe("bhib");
  });
});

describe("scene size and failure safety", () => {
  it("every asset is within the per-asset cap and a six-heavy-prop scene is refused", () => {
    expect(ASSETS.every((a) => a.kb <= MAX_ASSET_KB)).toBe(true);
    expect(checkAssets(["ph_boulder_01", "ph_potted_plant_01", "ph_moon_rock_01"])).toBe("scene too large");
  });
});

import { unsafeOutput } from "@/lib/brain/server/sanitize";
describe("Filipino and language rules", () => {
  it("moderates Filipino profanity and self-harm in replies, not normal Tagalog", () => {
    expect(unsafeOutput("Tangina naman")).toBe(true);
    expect(unsafeOutput("ang gago mo")).toBe(true);
    expect(unsafeOutput("Magandang umaga! Ano ang gusto mong matutunan ngayon?")).toBe(false);
    expect(unsafeOutput("Ang gagamba ay may walong paa.")).toBe(false); // gagamba (spider) is not 'gago'
  });
});
describe("language rule in prompt", () => {
  it("tells the brain to match English, Filipino or Taglish", () => {
    const sys = buildSystem({ teacher: "leo", world: "classroom", session: 1, skills: [], history: [], hintsUsed: 0, input: { kind: "session_start" } } as never);
    expect(JSON.stringify(sys)).toMatch(/Filipino \(Tagalog\), or Taglish/);
  });
});
