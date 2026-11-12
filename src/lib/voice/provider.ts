/**
 * Small provider boundary. The scene/teacher engine only knows this
 * interface, so the brain and voice backends can change without touching it.
 */
import type { BrainInput } from "@/lib/brain/types";
import type { TeacherId } from "@/lib/teacher/rig";
import type { WorldId } from "@/lib/worlds/registry";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

/** Token usage reported by a model-backed brain (none for the scripted brain). */
export interface UsageDelta {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

export interface VoiceEvents {
  onStatus(status: ConnectionStatus, detail?: string): void;
  onUserSpeechStart(t: number): void;
  /** utteranceEnd = local estimate of when sound actually stopped (may be undefined). */
  onUserSpeechStop(t: number, utteranceEnd?: number): void;
  onUserTranscript(text: string): void;
  onUserInterim?(text: string): void;
  onListenFailed?(reason: string): void;
  onResponseCreated(responseId: string): void;
  /** First audible output for this response. */
  onAudioStart(responseId: string, t: number): void;
  onAudioStop(responseId: string): void;
  onResponseFailed(responseId: string, reason: string): void;
  /** newSegment: the delta starts a new sentence/segment (caption replaces instead of appends). */
  onAssistantTranscript(responseId: string, delta: string, newSegment?: boolean): void;
  onToolCall(responseId: string, callId: string, name: string, args: string): void;
  onUsage(u: UsageDelta): void;
  onError(message: string): void;
}

export interface SessionInfo {
  teacher: TeacherId;
  world(): WorldId | "transit";
}

export interface VoiceProvider {
  readonly mode: "live" | "demo";
  connect(): Promise<void>;
  disconnect(): void;
  sendText(text: string): void;
  /** Non-speech input: taps, choices, answers, world arrival. */
  sendEvent(input: BrainInput): void;
  /** Stop current response + clear unplayed audio. */
  interrupt(): void;
  setMicEnabled(enabled: boolean): void;
  readonly micAvailable: boolean;
  /** Tap-to-talk providers listen for one utterance. */
  listenOnce?(): void;
  cancelListening?(): void;
  /** 0..1 loudness of the teacher's voice right now (drives the mouth). */
  getOutputLevel(): number;
  getInputLevel(): number;
  submitToolResult(callId: string, output: string): void;
  /** Ask the teacher to open the conversation. */
  greet(): void;
}
