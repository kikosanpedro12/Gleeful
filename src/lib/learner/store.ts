/**
 * Where learner evidence lives. The app only talks to this interface.
 *
 *   LocalLearnerStore    — THIS BROWSER ONLY (localStorage). Demo / family test.
 *   SupabaseLearnerStore — Stage E: parent accounts, RLS (supabase/migrations).
 *
 * Mapping to the database (supabase/migrations/*_init_learning_schema.sql):
 *   LearnerProfile          → public.learners (+ count of public.lesson_sessions)
 *   startSession()          → insert public.lesson_sessions
 *   recordAttempt(Attempt)  → insert public.attempts
 *       skill/questionId/answerId/correct/hintsUsed/context → same columns (snake_case)
 *       at        → created_at (set by the database, not the client)
 *       session   → session_id
 *   deleteAll()             → delete public.learners row (cascades everything)
 *
 * Rules for any implementation:
 *   - Never store audio or free text from the child.
 *   - Writes must never block the conversation (fire and forget, retry quietly).
 *   - Reads return what is known; a failed read returns an empty profile, never throws into the lesson.
 */
import { emptyProfile, type Attempt, type LearnerProfile } from "./profile";
import type { TeacherId } from "@/lib/teacher/rig";

export interface LearnerStore {
  /** Human-readable, for the parent view (e.g. "This browser only"). */
  readonly label: string;
  load(): Promise<LearnerProfile>;
  startSession(teacher: TeacherId): Promise<LearnerProfile>;
  recordAttempt(a: Omit<Attempt, "at" | "session">): Promise<void>;
  deleteAll(): Promise<void>;
}

const KEY = "aiteacher.learner.v1";

/** Validates whatever is in storage: it may be stale, edited by hand, or from an older version. */
function parse(raw: string | null): LearnerProfile {
  try {
    const p = JSON.parse(raw || "null");
    if (!p || p.version !== 1 || !Array.isArray(p.attempts)) return emptyProfile();
    const attempts = p.attempts.filter((a: Partial<Attempt>) =>
      a && typeof a.skill === "string" && typeof a.questionId === "string" && typeof a.answerId === "string" &&
      typeof a.correct === "boolean" && Number.isInteger(a.hintsUsed) && (a.hintsUsed as number) >= 0 &&
      (a.context === "taught" || a.context === "recheck" || a.context === "later_check"));
    return {
      version: 1,
      learnerId: typeof p.learnerId === "string" ? p.learnerId : "demo-child",
      teacher: p.teacher === "leo" || p.teacher === "mia" ? p.teacher : null,
      sessions: Number.isInteger(p.sessions) && p.sessions >= 0 ? p.sessions : 0,
      attempts: attempts.slice(-500),
    };
  } catch {
    return emptyProfile();
  }
}

export class LocalLearnerStore implements LearnerStore {
  readonly label = "This browser only (no account yet)";
  private read(): LearnerProfile {
    try { return parse(localStorage.getItem(KEY)); } catch { return emptyProfile(); }
  }
  private write(p: LearnerProfile) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full or blocked: the lesson goes on */ }
  }
  async load() { return this.read(); }
  async startSession(teacher: TeacherId) {
    const p = this.read();
    p.sessions += 1;
    p.teacher = teacher;
    this.write(p);
    return p;
  }
  async recordAttempt(a: Omit<Attempt, "at" | "session">) {
    const p = this.read();
    p.attempts.push({ ...a, session: p.sessions, at: new Date().toISOString() });
    p.attempts = p.attempts.slice(-500);
    this.write(p);
  }
  async deleteAll() {
    try { localStorage.removeItem(KEY); } catch {}
  }
}

/** The store the app uses. Stage E swaps this for SupabaseLearnerStore when a parent is signed in. */
export const learnerStore: LearnerStore = new LocalLearnerStore();
