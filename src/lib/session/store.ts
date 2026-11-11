import { create } from "zustand";
import { initialConvState, type ConvState } from "@/lib/teacher/stateMachine";
import type { SceneCommand } from "@/lib/scene/commands";
import type { TurnResult } from "@/lib/telemetry/latency";
import type { ConnectionStatus, UsageDelta } from "@/lib/voice/provider";

export interface TranscriptLine { id: number; role: "child" | "teacher"; text: string; turnId: number }
export interface Directive { id: number; turnId: number; command: SceneCommand }

export interface SessionStore {
  mode: "live" | "demo" | null;
  demoReason: string | null;
  status: ConnectionStatus;
  conv: ConvState;
  transcript: TranscriptLine[];
  banner: { kind: "info" | "error"; text: string } | null;
  micAvailable: boolean;
  micEnabled: boolean;
  directives: Directive[];
  boardText: string;
  results: TurnResult[];
  usage: UsageDelta & { responses: number };
  sessionStartedAt: number | null;
  rejectedCommands: number;
  staleDropped: number;
  model: string | null;
}

export const emptyUsage = { inputTokens: 0, outputTokens: 0, inputAudioTokens: 0, outputAudioTokens: 0, cachedTokens: 0, responses: 0 };

export const useSession = create<SessionStore>(() => ({
  mode: null,
  demoReason: null,
  status: "disconnected",
  conv: initialConvState,
  transcript: [],
  banner: null,
  micAvailable: false,
  micEnabled: true,
  directives: [],
  boardText: "Ask me anything!",
  results: [],
  usage: { ...emptyUsage },
  sessionStartedAt: null,
  rejectedCommands: 0,
  staleDropped: 0,
  model: null,
}));
