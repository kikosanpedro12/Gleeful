/**
 * Learner evidence: types and the honest status rule. Storage is in store.ts.
 * We record observations (what happened), never fixed labels.
 */
import type { TeacherId } from "@/lib/teacher/rig";

export interface Attempt {
  skill: string;
  questionId: string;
  answerId: string;
  correct: boolean;
  hintsUsed: number;
  /**
   * "taught" = during the lesson, right after an explanation.
   * "recheck" = no-hint check in the SAME session (minutes later). Not retention.
   * "later_check" = no-hint check in a LATER session. The only evidence of independence.
   */
  context: "taught" | "recheck" | "later_check";
  /** Session number when it happened (1 = first ever). */
  session?: number;
  /** Id of the lesson session (uuid), the future lesson_sessions.id. */
  sessionId?: string;
  at: string;
}

export interface LearnerProfile {
  version: 1;
  learnerId: string;
  teacher: TeacherId | null;
  sessions: number;
  attempts: Attempt[];
}

export const emptyProfile = (): LearnerProfile => ({ version: 1, learnerId: "demo-child", teacher: null, sessions: 0, attempts: [] });

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
  if (lastLater?.correct) return { kind: "independent", detail: "Answered correctly in a later session, with no hints." };
  if (lastLater && !lastLater.correct) return { kind: "learning", detail: "Missed the no-hint check in a later session; worth revisiting." };
  const re = a.filter((x) => x.context === "recheck");
  const lastRe = re[re.length - 1];
  if (lastRe?.correct) return { kind: "needs_check", detail: "Right again a few minutes later with no hints. Not yet checked on another day." };
  if (lastRe && !lastRe.correct) return { kind: "learning", detail: "Missed the no-hint check a few minutes later; worth revisiting." };
  const taught = a.filter((x) => x.context === "taught");
  const last = taught[taught.length - 1];
  if (last.correct)
    return { kind: "needs_check", detail: last.hintsUsed ? `Got it right after ${last.hintsUsed} hint${last.hintsUsed > 1 ? "s" : ""}. Not yet checked without help.` : "Got it right first try during the lesson. Not yet checked later without help." };
  return { kind: "learning", detail: "Did not get it during the lesson; the answer was explained." };
}

export const SKILL_LABELS: Record<string, string> = {
  "science.mars.red_color": "Why Mars looks red",
};
