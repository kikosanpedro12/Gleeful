import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseInterests, parseLearnerInput } from "@/lib/auth/validate";
import { cleanNameSay, INTERESTS, INTEREST_IDS, interestLabel, isInterestId, MAX_INTERESTS } from "@/lib/learner/interests";

const ROOT = path.resolve(import.meta.dirname, "..");
const base = { nickname: "Gaddi", grade: "3", preferred_teacher: "leo" };
const f = (o: Record<string, unknown>) => parseLearnerInput((k) => ({ ...base, ...o })[k]);

describe("interests list", () => {
  it("has the 17 agreed ids, unique, each with a plain label", () => {
    expect(INTERESTS.map((i) => i.id)).toEqual(["animals", "dinosaurs", "ocean", "nature", "space", "robots", "vehicles", "building", "football", "basketball", "art", "music_dance", "stories", "superheroes", "cooking", "games_puzzles", "experiments"]);
    expect(INTEREST_IDS.size).toBe(INTERESTS.length);
    for (const i of INTERESTS) expect(i.label).toMatch(/^[A-Z][A-Za-z ,]+$/);
    expect(interestLabel("music_dance")).toBe("Music and dance");
  });
  it("hostile ids are not in the list (Map/Set lookups, not object keys)", () => {
    for (const bad of ["__proto__", "constructor", "toString", "hasOwnProperty", "Animals", " space", ""]) expect(isInterestId(bad), bad).toBe(false);
    expect(interestLabel("__proto__")).toBe("__proto__");
  });
  it("the database check lists exactly the same ids", () => {
    const sql = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((x) => x.includes("learner_interests")).map((x) => fs.readFileSync(path.join(ROOT, "supabase/migrations", x), "utf8")).join("\n");
    const block = sql.match(/array\[([^\]]+)\]::text\[\]/)![1];
    expect([...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()).toEqual(INTERESTS.map((i) => i.id).sort());
  });
});

describe("parseInterests / parseLearnerInput", () => {
  it("accepts none, one, or up to 5 distinct known ids", () => {
    expect(parseInterests(undefined)).toEqual([]);
    expect(parseInterests("space")).toEqual(["space"]);
    expect(parseInterests(["space", "art", "robots", "ocean", "stories"])).toHaveLength(MAX_INTERESTS);
  });
  it("rejects a sixth, an unknown id, a duplicate, and non-strings", () => {
    expect(parseInterests(["space", "art", "robots", "ocean", "stories", "cooking"])).toBeNull();
    expect(parseInterests(["space", "minecraft"])).toBeNull();
    expect(parseInterests(["space", "space"])).toBeNull();
    expect(parseInterests([7])).toBeNull();
    expect(parseInterests(["__proto__"])).toBeNull();
    expect(parseInterests({ 0: "space" })).toBeNull();
  });
  it("the learner form carries both new fields through", () => {
    expect(f({ interests: ["space", "art"], name_say: " GAD-dee " })).toEqual({ ok: true, value: { nickname: "Gaddi", grade: 3, preferred_teacher: "leo", interests: ["space", "art"], name_say: "GAD-dee" } });
    expect(f({ interests: [], name_say: "" })).toMatchObject({ ok: true, value: { interests: [], name_say: null } });
  });
  it("the learner form refuses free text and bad respellings, with fixed messages", () => {
    const a = f({ interests: ["my secret hobby"] });
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.message).not.toContain("secret");
    for (const bad of ["Gaddi9", "<b>", "a_b", "x".repeat(41), "-start", "GAD\u0000dee", "http://x.co", 5]) expect(f({ name_say: bad }).ok, String(bad)).toBe(false);
  });
  it("name respelling: curly apostrophe is normalised, letters/space/hyphen/apostrophe kept", () => {
    expect(cleanNameSay("O’NEEL ann-marie")).toBe("O'NEEL ann-marie");
    expect(cleanNameSay("   ")).toBeNull();
  });
});

describe("parent area copy", () => {
  const privacy = fs.readFileSync(path.join(ROOT, "src/app/(marketing)/privacy/page.tsx"), "utf8");
  it("the privacy notice is dated 24 November 2026 and lists both new items without claiming the tutor uses them", () => {
    expect(privacy).toMatch(/24 November 2026/);
    expect(privacy).toMatch(/fixed list/);
    expect(privacy).toMatch(/how to say the child's name/);
    expect(privacy).toMatch(/today the tutor does not use them/);
  });
});

describe("tester additions: hostile form input", () => {
  it("2-D arrays, objects, files, odd types and 6 items are rejected", () => {
    for (const bad of [[["space"], ["art"]], [{ id: "space" }], [new Blob(["x"])], [null], [undefined], [["space", "art"]], 5, true, { length: 1, 0: "space" }]) expect(parseInterests(bad as never), JSON.stringify(bad)).toBeNull();
    expect(parseInterests(["space", "art", "robots", "ocean", "stories", "space"])).toBeNull();
    expect(parseInterests([])).toEqual([]);
    expect(parseInterests("")).toBeNull();
  });
  it("name_say: unicode, newline, NUL, homoglyph, SQL-ish and huge are rejected; collapse of spaces is fine", () => {
    for (const bad of ["Gäddi", "Гaddi", "Ｇaddi", "日本", "😀", "Ga​ddi", "a\u0000", "x'; drop table learners;--", "a%b", "a\\b", "a.b", "a".repeat(10_000), {}, [], ["a"], 0, false]) expect(cleanNameSay(bad), JSON.stringify(bad)).toBeUndefined();
    expect(cleanNameSay("Gaddi\n")).toBe("Gaddi");
    expect(cleanNameSay("A \t\n B")).toBe("A B");
    expect(cleanNameSay("Robert' OR 'x'-'y")).toBe("Robert' OR 'x'-'y");
    expect(cleanNameSay(" ")).toBeNull();
  });
  it("prototype-ish interest ids never resolve", () => {
    for (const k of ["__proto__", "constructor", "prototype", "valueOf"]) expect(parseInterests([k])).toBeNull();
  });
});
