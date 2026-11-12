/**
 * Learner evidence. LOCAL DEMO STORAGE (this browser only) — not the
 * production store, which will be Supabase with parent accounts and RLS.
 * We record observations (what happened), never fixed labels.
 */
import type { TeacherId } from "@/lib/teacher/rig";

export interface Attempt {
  skill: string;
  questionId: string;
  answerId: string;
  correct: boolean;
  hintsUsed: number;
  /** "taught" = right after an explanation; "later_check" = a later, unassisted check. */
  context: "taught" | "later_check";
  at: string;
}

export interface LearnerProfile {
  version: 1;
  learnerId: string;
  teacher: TeacherId | null;
  sessions: number;
  attempts: Attempt[];
}

const KEY = "aiteacher.learner.v1";
export const emptyProfile = (): LearnerProfile => ({ version: 1, learnerId: "demo-child", teacher: null, sessions: 0, attempts: [] });

export function loadProfile(): LearnerProfile {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "null");
    if (p && p.version === 1 && Array.isArray(p.attempts)) return p;
  } catch {}
  return emptyProfile();
}

export function saveProfile(p: LearnerProfile) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
}

export function updateProfile(fn: (p: LearnerProfile) => void): LearnerProfile {
  const p = loadProfile();
  fn(p);
  saveProfile(p);
  return p;
}

export function deleteProfile() {
  try { localStorage.removeItem(KEY); } catch {}
}

export type SkillStatus =
  | { kind: "not_seen" }
  | { kind: "learning"; detail: string }
  | { kind: "needs_check"; detail: string }
  | { kind: "independent"; detail: string };

/** Honest one-line status. One assisted correct answer is NOT mastery. */
export function skillStatus(attempts: Attempt[], skill: string): SkillStatus {
  const a = attempts.filter((x) => x.skill === skill);
  if (!a.length) return { kind: "not_seen" };
  const later = a.filter((x) => x.context === "later_check");
  const lastLater = later[later.length - 1];
  if (lastLater?.correct) return { kind: "independent", detail: "Answered correctly on a later check with no hints." };
  if (lastLater && !lastLater.correct) return { kind: "learning", detail: "Missed the later no-hint check; worth revisiting." };
  const taught = a.filter((x) => x.context === "taught");
  const last = taught[taught.length - 1];
  if (last.correct)
    return { kind: "needs_check", detail: last.hintsUsed ? `Got it right after ${last.hintsUsed} hint${last.hintsUsed > 1 ? "s" : ""}. Not yet checked without help.` : "Got it right first try during the lesson. Not yet checked later without help." };
  return { kind: "learning", detail: "Did not get it during the lesson; the answer was explained." };
}

export const SKILL_LABELS: Record<string, string> = {
  "science.mars.red_color": "Why Mars looks red",
};
