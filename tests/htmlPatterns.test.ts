import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Browsers compile HTML `pattern` with the "v" flag; a bare "-" in a class makes it throw and
// the browser then silently skips validation (found 23 Nov 2026).
describe("form patterns", () => {
  it("the name_say pattern compiles in v mode", () => {
    const src = readFileSync("src/app/parent/ParentForms.tsx", "utf8");
    const m = src.match(/pattern=\{("(?:[^"\\]|\\.)*")\}/);
    expect(m).not.toBeNull();
    const pat = JSON.parse(m![1]);
    expect(() => new RegExp(`^(?:${pat})$`, "v")).not.toThrow();
    expect(new RegExp(`^(?:${pat})$`, "v").test("GAD-dee")).toBe(true);
    expect(new RegExp(`^(?:${pat})$`, "v").test("<b>")).toBe(false);
  });
});
