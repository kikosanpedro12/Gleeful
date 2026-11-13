import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GRADES, GRADE_MAX, GRADE_MIN, GRADE_RANGE_COPY, gradeLabel, isValidGrade } from "@/lib/learner/grades";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");

describe("grade range (one source of truth)", () => {
  it("kindergarten is 0 and the range is 0-12", () => {
    expect([GRADE_MIN, GRADE_MAX]).toEqual([0, 12]);
    expect(GRADES).toHaveLength(13);
    expect(gradeLabel(0)).toBe("Kindergarten");
    expect(gradeLabel(7)).toBe("Grade 7");
  });
  it("accepts 0-12 whole numbers only", () => {
    for (const g of [0, 1, 12]) expect(isValidGrade(g)).toBe(true);
    for (const g of [-1, 13, 1.5, NaN, "3", null, undefined]) expect(isValidGrade(g)).toBe(false);
  });
  it("the latest database check matches the code", () => {
    const sql = read("supabase/migrations/20261113071456_learners_allow_kindergarten.sql");
    expect(sql).toContain(`check (grade between ${GRADE_MIN} and ${GRADE_MAX})`);
  });
  it("public copy uses the same range wording", () => {
    expect(GRADE_RANGE_COPY).toBe("kindergarten to grade 12");
    expect(read("public/llms.txt").toLowerCase()).toContain(GRADE_RANGE_COPY);
  });
});
