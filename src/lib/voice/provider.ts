/**
 * Small provider boundary. The scene/teacher engine only knows this
 * interface, so another voice backend can be evaluated later.
 */
export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface UsageDelta {
  inputTokens: number;
  outputTokens: number;
  inputAudioTokens: number;
  outputAudioTokens: number;
  cachedTokens: number;
}

export interface VoiceEvents {
  onStatus(status: ConnectionStatus, detail?: string): void;
  onUserSpeechStart(t: number): void;
  /** utteranceEnd = local estimate of when sound actually stopped (may be undefined). */
  onUserSpeechStop(t: number, utteranceEnd?: number): void;
  onUserTranscript(text: string): void;
  onResponseCreated(responseId: string): void;
  /** First audible output for this response. */
  onAudioStart(responseId: string, t: number): void;
  onAudioStop(responseId: string): void;
  onResponseFailed(responseId: string, reason: string): void;
  onAssistantTranscript(responseId: string, delta: string): void;
  onToolCall(responseId: string, callId: string, name: string, args: string): void;
  onUsage(u: UsageDelta): void;
  onError(message: string): void;
}

export interface VoiceProvider {
  readonly mode: "live" | "demo";
  connect(): Promise<void>;
  disconnect(): void;
  sendText(text: string): void;
  /** Stop current response + clear unplayed audio. */
  interrupt(): void;
  setMicEnabled(enabled: boolean): void;
  readonly micAvailable: boolean;
  /** 0..1 loudness of the teacher's voice right now (drives the mouth). */
  getOutputLevel(): number;
  getInputLevel(): number;
  submitToolResult(callId: string, output: string): void;
  /** Ask the teacher to open the conversation. */
  greet(): void;
}

export function rms(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buf);
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}
