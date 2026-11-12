import { create } from "zustand";
import { initialConvState, type ConvState } from "@/lib/teacher/stateMachine";
import type { Choice, SceneCommand } from "@/lib/scene/commands";
import type { TurnResult } from "@/lib/telemetry/latency";
import type { ConnectionStatus, UsageDelta } from "@/lib/voice/provider";
import type { TeacherId } from "@/lib/teacher/rig";
import type { WorldId } from "@/lib/worlds/registry";

export interface TranscriptLine { id: number; role: "child" | "teacher"; text: string; turnId: number }
export interface Directive { id: number; turnId: number; command: SceneCommand }

/** A trip between worlds. `t0` is performance.now() when it began. */
export interface Transit { from: WorldId; to: WorldId; t0: number; style: "space_flight" | "fade" }

export interface SessionStore {
  mode: "live" | "demo" | null;
  status: ConnectionStatus;
  conv: ConvState;
  /** Onboarding choice; null until the child picks. */
  teacher: TeacherId | null;
  /** Teacher shown in the onboarding voice preview. */
  previewing: TeacherId | null;
  world: WorldId;
  transit: Transit | null;
  transcript: TranscriptLine[];
  /** What the teacher is saying right now (one sentence), for the on-screen caption. */
  caption: string;
  banner: { kind: "info" | "error"; text: string } | null;
  micAvailable: boolean;
  /** Tap-to-talk: currently capturing one utterance. */
  listening: boolean;
  interim: string;
  directives: Directive[];
  boardText: string;
  choices: Choice[];
  question: { id: string; world: WorldId } | null;
  /** Object the teacher has invited the child to tap. */
  invite: string | null;
  /** Object currently picked up for inspection. */
  inspecting: string | null;
  results: TurnResult[];
  usage: UsageDelta & { responses: number };
  sessionStartedAt: number | null;
  rejectedCommands: number;
  staleDropped: number;
  model: string | null;
  /** Who answered the last turn. null until a turn has been answered. Drives the on-screen "AI" badge. */
  brainKind: "scripted" | "model" | null;
}

export const emptyUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, responses: 0 };

export const initialStore = (): SessionStore => ({
  mode: null,
  status: "disconnected",
  conv: initialConvState,
  teacher: null,
  previewing: null,
  world: "classroom",
  transit: null,
  transcript: [],
  caption: "",
  banner: null,
  micAvailable: false,
  listening: false,
  interim: "",
  directives: [],
  boardText: "Ask me anything!",
  choices: [],
  question: null,
  invite: null,
  inspecting: null,
  results: [],
  usage: { ...emptyUsage },
  sessionStartedAt: null,
  rejectedCommands: 0,
  staleDropped: 0,
  model: null,
  brainKind: null,
});

export const useSession = create<SessionStore>(() => initialStore());
