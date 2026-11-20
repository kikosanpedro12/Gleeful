import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { FIGURES, figureById } from "@/lib/assets/figures";
import { MAX_ASSET_KB } from "@/lib/assets/manifest";
import { toolsFor } from "@/lib/scene/commands";
import { contextFor } from "@/lib/worlds/registry";

const lic = fs.readFileSync("ASSET_LICENSES.md", "utf8");

describe("figures (3D character, portrait, name card)", () => {
  it("ids are unique, plain, and safe to use as a lookup key", () => {
    const ids = FIGURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]{1,40}$/);
    expect(figureById.get("__proto__")).toBeUndefined();
    expect(figureById.get("constructor")).toBeUndefined();
  });
  it("every figure has a name, years and a short plain blurb with no links or markup", () => {
    for (const f of FIGURES) {
      expect(f.name.length).toBeGreaterThan(2);
      expect(f.years.length).toBeGreaterThan(3);
      expect(f.blurb.length).toBeGreaterThan(20);
      expect(f.blurb.length).toBeLessThanOrEqual(160);
      for (const t of [f.name, f.years, f.blurb]) expect(t).not.toMatch(/[<>@]|https?:|www\./i);
    }
  });
  it("a model figure ships a licensed file under the size cap; a card ships nothing", () => {
    for (const f of FIGURES) {
      if (f.tier === "model") {
        expect(f.model).toMatch(/^tripo\/[a-z0-9-]+\.glb$/);
        const file = `public/assets/${f.model}`;
        expect(fs.existsSync(file)).toBe(true);
        const kb = fs.statSync(file).size / 1024;
        expect(Math.abs(kb - (f.kb ?? 0))).toBeLessThan(2);
        expect(kb).toBeLessThanOrEqual(MAX_ASSET_KB);
        expect(lic.includes(`public/assets/${f.model}`)).toBe(true);
      } else if (f.tier === "card") {
        expect(f.model ?? f.file).toBeUndefined();
      } else {
        expect(f.file && f.credit && f.sourceUrl?.startsWith("https://")).toBeTruthy();
        expect(lic.includes(f.file!)).toBe(true);
      }
    }
  });
  it("only people long gone get a 3D character; anyone recent is a name card", () => {
    for (const f of FIGURES) {
      expect(f.diedBy).toBeGreaterThan(0);
      if (f.tier === "model") expect(f.diedBy).toBeLessThanOrEqual(1950);
    }
  });
  it("the brain is told which figures are cards and which are characters", () => {
    const t = toolsFor(contextFor("classroom")).find((x: { name: string }) => x.name === "showScene") as { input_schema: { properties: { figure: { description: string } } } };
    const d = t.input_schema.properties.figure.description;
    for (const f of FIGURES) expect(d).toContain(f.tier === "card" ? `${f.id} (name card only, no picture)` : `${f.id} (3D character)`);
  });
  it("all three tiers are in use, so each path is exercised", () => {
    expect(FIGURES.some((f) => f.tier === "model")).toBe(true);
    expect(FIGURES.some((f) => f.tier === "card")).toBe(true);
  });
});

describe("licence rows stay current", () => {
  it("no licence row says a wired Tripo file is not wired", () => {
    expect(lic).not.toMatch(/Not yet wired/);
  });
});
