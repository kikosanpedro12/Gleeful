/**
 * The wire format between the browser (ClaudeBrain) and /api/brain.
 * Types and plain constants only: this file is safe to import from client code.
 * The server re-validates every field; nothing here is trusted on arrival.
 */
import type { WorldId } from "@/lib/worlds/registry";
import type { TeacherId } from "@/lib/teacher/rig";
import type { Segment } from "./types";

export const BRAIN_ENDPOINT = "/api/brain";
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const SNAKE_RE = /^[a-z][a-z0-9_]{0,31}$/;

export type WireInput =
  | { kind: "text"; text: string }
  | { kind: "session_start" }
  | { kind: "transit_cruise"; to: WorldId }
  | { kind: "world_ready"; world: WorldId }
  | { kind: "tap"; target: string }
  | { kind: "choice"; id: string; label: string }
  | { kind: "answer"; questionId: string; optionId: string }
  | { kind: "resume" };

export type WireSkillStatus = "not_seen" | "learning" | "needs_check" | "independent";

export interface BrainRequest {
  v: 1;
  learnerId: string;
  sessionId: string;
  /** IANA zone of the family. The server pins the first one it sees for a learner. */
  tz: string;
  world: WorldId | "transit";
  teacher: TeacherId;
  /** 1 = the child's first session ever. */
  session: number;
  input: WireInput;
  /** Wrong answers already given on the open question, before this one. The server decides what to say, never whether it was right. */
  hintsUsed: number;
  history: { role: "child" | "teacher"; text: string }[];
  skills: { skill: string; status: WireSkillStatus }[];
}

export interface BrainResponse {
  segments: Segment[];
  /** Which model answered: "default" (Haiku) or "hard" (Sonnet). */
  model: "default" | "hard";
}

export type BrainErrorCode =
  | "brain_disabled" | "brain_unconfigured" | "forbidden_origin" | "unsupported_media"
  | "too_large" | "bad_request" | "rate_limited" | "daily_limit" | "global_limit"
  | "upstream_failed" | "upstream_timeout" | "upstream_busy" | "bad_model_output";
