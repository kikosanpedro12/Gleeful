/**
 * The grade range Gleeful teaches. ONE source of truth for copy and validation:
 * kindergarten is stored as grade 0, grades 1-12 as themselves. The database
 * check (supabase/migrations/*learners_allow_kindergarten.sql) must match;
 * tests/grades.test.ts fails if the range, the migrations or the marketing
 * copy drift apart.
 */
export const GRADE_MIN = 0;
export const GRADE_MAX = 12;
/** How the range is written in public copy, metadata and llms.txt. */
export const GRADE_RANGE_COPY = "kindergarten to grade 12";

export const isValidGrade = (g: unknown): g is number => typeof g === "number" && Number.isInteger(g) && g >= GRADE_MIN && g <= GRADE_MAX;
export const gradeLabel = (g: number): string => (g === 0 ? "Kindergarten" : `Grade ${g}`);
export const GRADES: readonly number[] = Array.from({ length: GRADE_MAX - GRADE_MIN + 1 }, (_, i) => GRADE_MIN + i);
