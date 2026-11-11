import { describe, expect, it } from "vitest";
import { initialConvState, reduce, type ConvEvent, type ConvState } from "@/lib/teacher/stateMachine";

const run = (events: ConvEvent[], from: ConvState = initialConvState) => events.reduce(reduce, from);
const connected = run([{ type: "CONNECTED" }]);

describe("conversation state machine", () => {
  it("ignores everything while offline", () => {
    expect(run([{ type: "USER_SPEECH_START" }, { type: "USER_TEXT" }])).toEqual(initialConvState);
  });
  it("walks a normal voice turn", () => {
    let s = run([{ type: "USER_SPEECH_START" }], connected);
    expect(s).toMatchObject({ state: "listening", turnId: 1, interrupted: false });
    s = reduce(s, { type: "USER_SPEECH_STOP" });
    expect(s.state).toBe("thinking");
    s = reduce(s, { type: "RESPONSE_AUDIO_START", turnId: 1 });
    expect(s.state).toBe("speaking");
    s = reduce(s, { type: "RESPONSE_AUDIO_STOP", turnId: 1 });
    expect(s.state).toBe("idle");
  });
  it("barge-in while speaking starts a new, interrupted turn", () => {
    const speaking = run([{ type: "USER_TEXT" }, { type: "RESPONSE_AUDIO_START", turnId: 1 }], connected);
    const s = reduce(speaking, { type: "USER_SPEECH_START" });
    expect(s).toMatchObject({ state: "listening", turnId: 2, interrupted: true });
  });
  it("drops audio start/stop from a stale turn", () => {
    const s0 = run([{ type: "USER_TEXT" }, { type: "USER_SPEECH_START" }, { type: "USER_SPEECH_STOP" }], connected);
    expect(s0.turnId).toBe(2);
    const s1 = reduce(s0, { type: "RESPONSE_AUDIO_START", turnId: 1 });
    expect(s1).toBe(s0); // old response cannot make the teacher speak
    const s2 = reduce(reduce(s0, { type: "RESPONSE_AUDIO_START", turnId: 2 }), { type: "RESPONSE_AUDIO_STOP", turnId: 1 });
    expect(s2.state).toBe("speaking");
  });
  it("manual interrupt stops thinking/speaking and bumps the turn", () => {
    const speaking = run([{ type: "USER_TEXT" }, { type: "RESPONSE_AUDIO_START", turnId: 1 }], connected);
    expect(reduce(speaking, { type: "INTERRUPT" })).toMatchObject({ state: "idle", turnId: 2, interrupted: true });
    expect(reduce(connected, { type: "INTERRUPT" })).toBe(connected);
  });
  it("continued speech while listening is the same turn", () => {
    const l = run([{ type: "USER_SPEECH_START" }], connected);
    expect(reduce(l, { type: "USER_SPEECH_START" })).toBe(l);
  });
  it("teacher can speak first from idle (greeting)", () => {
    expect(reduce(connected, { type: "RESPONSE_AUDIO_START", turnId: 0 }).state).toBe("speaking");
  });
  it("failure returns to idle; disconnect invalidates the turn", () => {
    const t = run([{ type: "USER_TEXT" }], connected);
    expect(reduce(t, { type: "RESPONSE_FAILED", turnId: 1 }).state).toBe("idle");
    const d = reduce(t, { type: "DISCONNECTED" });
    expect(d).toMatchObject({ state: "offline", turnId: 2 });
  });
});
