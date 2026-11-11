/**
 * Deterministic conversation state machine. Pure: no timers, no I/O.
 * Every user turn bumps `turnId`; anything produced for an older turn is stale
 * and must be dropped (audio, mouth movement, gestures, scene commands).
 */
export type TeacherState = "offline" | "idle" | "listening" | "thinking" | "speaking";

export interface ConvState {
  state: TeacherState;
  /** Monotonic id of the current conversational turn. */
  turnId: number;
  /** True when the current turn began by cutting the teacher off. */
  interrupted: boolean;
}

export type ConvEvent =
  | { type: "CONNECTED" }
  | { type: "DISCONNECTED" }
  | { type: "USER_SPEECH_START" }
  | { type: "USER_SPEECH_STOP" }
  | { type: "USER_TEXT" }
  | { type: "INTERRUPT" }
  | { type: "RESPONSE_AUDIO_START"; turnId: number }
  | { type: "RESPONSE_AUDIO_STOP"; turnId: number }
  | { type: "RESPONSE_FAILED"; turnId: number };

export const initialConvState: ConvState = { state: "offline", turnId: 0, interrupted: false };

export function isStale(s: ConvState, turnId: number): boolean {
  return turnId !== s.turnId;
}

export function reduce(s: ConvState, e: ConvEvent): ConvState {
  switch (e.type) {
    case "CONNECTED":
      return s.state === "offline" ? { ...s, state: "idle" } : s;
    case "DISCONNECTED":
      return { state: "offline", turnId: s.turnId + 1, interrupted: false };
  }
  if (s.state === "offline") return s;

  switch (e.type) {
    case "USER_SPEECH_START": {
      const busy = s.state === "speaking" || s.state === "thinking";
      // Speech while already listening is the same turn continuing.
      if (s.state === "listening") return s;
      return { state: "listening", turnId: s.turnId + 1, interrupted: busy };
    }
    case "USER_SPEECH_STOP":
      return s.state === "listening" ? { ...s, state: "thinking" } : s;
    case "USER_TEXT": {
      const busy = s.state === "speaking" || s.state === "thinking";
      return { state: "thinking", turnId: s.turnId + 1, interrupted: busy };
    }
    case "INTERRUPT":
      if (s.state === "speaking" || s.state === "thinking")
        return { state: "idle", turnId: s.turnId + 1, interrupted: true };
      return s;
    case "RESPONSE_AUDIO_START":
      if (isStale(s, e.turnId)) return s;
      // Teacher may also speak first from idle (greeting).
      return s.state === "thinking" || s.state === "idle" ? { ...s, state: "speaking" } : s;
    case "RESPONSE_AUDIO_STOP":
      if (isStale(s, e.turnId)) return s;
      return s.state === "speaking" ? { ...s, state: "idle", interrupted: false } : s;
    case "RESPONSE_FAILED":
      if (isStale(s, e.turnId)) return s;
      return s.state === "thinking" || s.state === "speaking" ? { ...s, state: "idle" } : s;
  }
  return s;
}
