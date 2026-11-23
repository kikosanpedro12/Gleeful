/**
 * Input rules for sign-in and learner forms. Pure functions, no I/O.
 * Error messages are fixed strings: they never echo the input and never say
 * whether an account exists.
 */
import { isValidGrade } from "@/lib/learner/grades";
import { cleanNameSay, INTEREST_IDS, MAX_INTERESTS, NAME_SAY_MAX } from "@/lib/learner/interests";

export const PASSWORD_MIN = 10;
/** bcrypt, which Supabase uses, only looks at the first 72 bytes. */
export const PASSWORD_MAX = 72;
export const EMAIL_MAX = 254;

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (e.length < 6 || e.length > EMAIL_MAX || !EMAIL_RE.test(e)) return null;
  return e;
}

/** null = fine. Byte length, because bcrypt counts bytes. */
export function passwordProblem(raw: unknown): string | null {
  if (typeof raw !== "string") return "Enter a password.";
  const bytes = new TextEncoder().encode(raw).length;
  if (raw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (bytes > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} bytes (a shorter password).`;
  return null;
}

export type SignInMode = "password" | "magic" | "signup";
export const isMode = (m: unknown): m is SignInMode => m === "password" || m === "magic" || m === "signup";

export const NICKNAME_MAX = 40;
export const MAX_LEARNERS_PER_PARENT = 8;
export const TEACHERS = ["leo", "mia"] as const;

export interface LearnerInput { nickname: string; grade: number; preferred_teacher: (typeof TEACHERS)[number]; interests: string[]; name_say: string | null }

/** Strips control characters and collapses spaces; a nickname is a label, not a name. */
export function cleanNickname(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const n = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return n.length >= 1 && n.length <= NICKNAME_MAX ? n : null;
}

/** Interest ids from the form: every item must be in the fixed list, no repeats, at most MAX_INTERESTS. */
export function parseInterests(raw: unknown): string[] | null {
  const list = raw === undefined || raw === null ? [] : Array.isArray(raw) ? raw : [raw];
  if (list.length > MAX_INTERESTS) return null;
  const seen = new Set<string>();
  for (const v of list) {
    if (typeof v !== "string" || !INTEREST_IDS.has(v) || seen.has(v)) return null;
    seen.add(v);
  }
  return [...seen];
}

export function parseLearnerInput(get: (k: string) => unknown): { ok: true; value: LearnerInput } | { ok: false; message: string } {
  const nickname = cleanNickname(get("nickname"));
  if (!nickname) return { ok: false, message: `Give your child a nickname of 1 to ${NICKNAME_MAX} characters.` };
  const rawGrade = get("grade");
  const grade = typeof rawGrade === "string" && /^\d{1,2}$/.test(rawGrade) ? Number(rawGrade) : NaN;
  if (!isValidGrade(grade)) return { ok: false, message: "Choose a grade from kindergarten to 12." };
  const teacher = get("preferred_teacher");
  if (teacher !== "leo" && teacher !== "mia") return { ok: false, message: "Choose Leo or Mia." };
  const interests = parseInterests(get("interests"));
  if (!interests) return { ok: false, message: `Choose up to ${MAX_INTERESTS} interests from the list.` };
  const name_say = cleanNameSay(get("name_say"));
  if (name_say === undefined) return { ok: false, message: `Write how to say the name using only letters, spaces, hyphens and apostrophes (up to ${NAME_SAY_MAX}), like GAD-dee.` };
  return { ok: true, value: { nickname, grade, preferred_teacher: teacher, interests, name_say } };
}
