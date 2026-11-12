/**
 * The "brain" decides what the teacher says and does next. It only ever
 * returns words + validated semantic actions. Today: ScriptedBrain (a
 * deterministic lesson, NOT AI). Next: a Claude-API brain behind the same
 * interface, called from a server route so the key never reaches the browser.
 */
import type { WorldId } from "@/lib/worlds/registry";
import type { LearnerProfile } from "@/lib/learner/profile";
import type { TeacherId } from "@/lib/teacher/rig";

export type BrainInput =
  | { kind: "text"; text: string }
  | { kind: "session_start" }
  | { kind: "transit_cruise"; to: WorldId }
  | { kind: "world_ready"; world: WorldId }
  | { kind: "tap"; target: string }
  | { kind: "choice"; id: string; label: string }
  | { kind: "answer"; questionId: string; optionId: string };

export interface Action { name: string; args: Record<string, unknown> }
export interface Segment { say: string; actions?: Action[] }
export interface BrainReply { segments: Segment[] }

export interface BrainContext {
  world: WorldId | "transit";
  teacher: TeacherId;
  teacherName: string;
  profile: LearnerProfile;
  record(attempt: Omit<LearnerProfile["attempts"][number], "at">): void;
}

export interface Brain {
  readonly kind: "scripted" | "model";
  respond(input: BrainInput, ctx: BrainContext): BrainReply;
}
