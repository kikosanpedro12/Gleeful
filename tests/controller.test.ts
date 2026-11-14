import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceEvents, VoiceProvider, SessionInfo } from "@/lib/voice/provider";
import type { BrainInput } from "@/lib/brain/types";

/** Fake provider: records what the controller asks for; the test drives its events. */
class Fake implements VoiceProvider {
  static last: Fake;
  readonly mode = "demo" as const;
  micAvailable = true;
  calls: string[] = [];
  events: BrainInput[] = [];
  results: string[] = [];
  constructor(public ev: VoiceEvents, public info: SessionInfo) { Fake.last = this; }
  async connect() { this.ev.onStatus("connecting"); this.ev.onStatus("connected"); }
  disconnect() { this.calls.push("disconnect"); this.ev.onStatus("disconnected"); }
  sendText(t: string) { this.calls.push(`text:${t}`); }
  sendEvent(i: BrainInput) { this.events.push(i); this.calls.push(`event:${i.kind}`); }
  interrupt() { this.calls.push("interrupt"); }
  greet() { this.calls.push("greet"); }
  listenOnce() { this.calls.push("listen"); }
  cancelListening() { this.calls.push("cancelListen"); }
  setMicEnabled() {}
  getOutputLevel() { return 0; }
  getInputLevel() { return 0; }
  submitToolResult(_id: string, out: string) { this.results.push(out); }
  /** Play one whole reply: created → audio → tool calls → stop. */
  reply(id: string, tools: [string, object][] = [], stop = true) {
    this.ev.onResponseCreated(id);
    this.ev.onAudioStart(id, performance.now());
    tools.forEach(([n, a], i) => this.ev.onToolCall(id, `${id}_${i}`, n, JSON.stringify(a)));
    if (stop) this.ev.onAudioStop(id);
  }
}

const store = new Map<string, string>();
async function load() {
  vi.resetModules();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  vi.stubGlobal("navigator", { userAgent: "test" });
  const { session } = await import("@/lib/session/controller");
  const { useSession } = await import("@/lib/session/store");
  session.setProviderFactory((ev, info) => new Fake(ev, info));
  session.chooseTeacher("leo");
  await session.start();
  const p = Fake.last;
  p.reply("greeting");
  return { session, s: () => useSession.getState(), p };
}

beforeEach(() => { store.clear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("session controller", () => {
  it("needs a chosen teacher before starting", async () => {
    vi.resetModules();
    const { session } = await import("@/lib/session/controller");
    const { useSession } = await import("@/lib/session/store");
    session.setProviderFactory((ev, info) => new Fake(ev, info));
    await session.start();
    expect(useSession.getState().status).toBe("disconnected");
  });

  it("greeting plays from idle and is not a measured turn", async () => {
    const { s, p } = await load();
    expect(p.calls).toContain("greet");
    expect(s().conv.state).toBe("idle");
    expect(s().results).toHaveLength(0);
  });

  it("validated tool calls update choices, invites, questions; invalid ones are rejected", async () => {
    const { session, s, p } = await load();
    session.sendText("hi");
    p.reply("r1", [["offerChoices", { choices: [{ id: "mars", label: "Mars" }] }], ["pointAt", { target: "rock_1" }]], false);
    expect(s().choices).toEqual([{ id: "mars", label: "Mars" }]);
    expect(s().rejectedCommands).toBe(1); // rock_1 is not in the classroom
    expect(p.results.at(-1)).toMatch(/target must be one of/);
  });

  it("openWorld starts a trip; arrival switches world and asks the teacher to speak", async () => {
    const { session, s, p } = await load();
    session.sendText("mars");
    p.reply("r1", [["openWorld", { world: "mars" }]], false);
    expect(s().transit).toMatchObject({ from: "classroom", to: "mars", style: "space_flight" });
    // Mid-flight, while still talking: cruise is queued, not spoken over the teacher.
    session.transitEvent("cruise");
    expect(p.events).toHaveLength(0);
    p.ev.onAudioStop("r1");
    expect(p.events.map((e) => e.kind)).toEqual(["transit_cruise"]);
    p.reply("c1");
    session.transitEvent("arrived");
    expect(s().world).toBe("mars");
    expect(s().transit).toBeNull();
    expect(p.events.at(-1)).toEqual({ kind: "world_ready", world: "mars" });
    // The arrival reply (teacher-initiated, from idle) is accepted and spoken.
    p.ev.onResponseCreated("a1");
    p.ev.onAudioStart("a1", 0);
    expect(s().conv.state).toBe("speaking");
  });

  it("going home from a planet is a return flight, not a blank fade, and lands in class", async () => {
    const { session, s, p } = await load();
    session.sendText("mars");
    p.reply("r1", [["openWorld", { world: "mars" }]], false);
    session.transitEvent("arrived");
    p.ev.onAudioStop("r1");
    p.reply("a1");
    session.sendText("back to class");
    p.reply("r2", [["openWorld", { world: "classroom" }]], false);
    expect(s().transit).toMatchObject({ from: "mars", to: "classroom", style: "space_return" });
    // No mid-flight line on the way home (the outbound cruise line is about the planet ahead).
    session.transitEvent("cruise");
    p.ev.onAudioStop("r2");
    expect(p.events.map((e) => e.kind)).not.toContain("transit_cruise");
    session.transitEvent("arrived");
    expect(s().world).toBe("classroom");
    expect(s().transit).toBeNull();
  });

  it("a stale cruise line is dropped once we have landed", async () => {
    const { session, s, p } = await load();
    session.sendText("mars");
    p.reply("r1", [["openWorld", { world: "mars" }]], false);
    session.transitEvent("cruise");
    session.transitEvent("arrived");
    p.ev.onAudioStop("r1");
    expect(p.events.map((e) => e.kind)).toEqual(["world_ready"]);
    expect(s().world).toBe("mars");
  });

  it("tap only works on interactive objects of the current world, and opens inspection", async () => {
    const { session, s, p } = await load();
    session.tap("rock_1"); // not in the classroom
    expect(p.events).toHaveLength(0);
    // Go to Mars
    session.sendText("mars");
    p.reply("r1", [["openWorld", { world: "mars" }]]);
    session.transitEvent("arrived");
    p.reply("a1", [["inviteTap", { target: "rock_1" }]]);
    expect(s().invite).toBe("rock_1");
    session.tap("rock_1");
    expect(s().inspecting).toBe("rock_1");
    expect(s().invite).toBeNull();
    expect(p.events.at(-1)).toEqual({ kind: "tap", target: "rock_1" });
    expect(s().conv.state).toBe("thinking");
  });

  it("a spoken question puts the inspected object back (the teacher never walks off holding the rock)", async () => {
    const { session, s, p } = await load();
    session.sendText("mars");
    p.reply("r1", [["openWorld", { world: "mars" }]]);
    session.transitEvent("arrived");
    p.reply("a1", [["inviteTap", { target: "rock_1" }]]);
    session.tap("rock_1");
    expect(s().inspecting).toBe("rock_1");
    p.ev.onUserTranscript("can we see the volcano");
    expect(s().inspecting).toBeNull();
  });

  it("answers go through only for the open question and its real options", async () => {
    const { session, s, p } = await load();
    session.sendText("mars");
    p.reply("r1", [["openWorld", { world: "mars" }]]);
    session.transitEvent("arrived");
    p.reply("a1", [["askQuestion", { questionId: "q_red" }]]);
    expect(s().question).toEqual({ id: "q_red", world: "mars" });
    session.answer("not_an_option");
    expect(p.events.filter((e) => e.kind === "answer")).toHaveLength(0);
    session.answer("rust");
    expect(p.events.at(-1)).toEqual({ kind: "answer", questionId: "q_red", optionId: "rust" });
    expect(s().question).toBeNull();
  });

  it("a choice from the old turn cannot be used after the child moves on", async () => {
    const { session, s, p } = await load();
    session.sendText("hi");
    p.reply("r1", [["offerChoices", { choices: [{ id: "mars", label: "Mars" }] }]]);
    session.sendText("something else"); // new turn clears old choices
    expect(s().choices).toEqual([]);
    session.choose("mars");
    expect(p.events.filter((e) => e.kind === "choice")).toHaveLength(0);
  });

  it("interrupt mid-reply: old tool calls are dropped and never change the scene", async () => {
    const { session, s, p } = await load();
    session.sendText("hi");
    p.ev.onResponseCreated("r1");
    p.ev.onAudioStart("r1", 0);
    session.interrupt();
    expect(s().conv.state).toBe("idle");
    p.ev.onToolCall("r1", "c", "openWorld", JSON.stringify({ world: "mars" }));
    expect(s().transit).toBeNull();
    expect(s().staleDropped).toBeGreaterThan(0);
  });

  it("tap-to-talk while the teacher speaks interrupts him, then listens", async () => {
    const { session, s, p } = await load();
    session.sendText("hi");
    p.ev.onResponseCreated("r1");
    p.ev.onAudioStart("r1", 0);
    session.talk();
    expect(p.calls.slice(-2)).toEqual(["interrupt", "listen"]);
    expect(s().conv.state).toBe("idle");
    p.ev.onUserSpeechStart(1);
    expect(s().listening).toBe(true);
    p.ev.onUserSpeechStop(2, 1.5);
    expect(s().conv.state).toBe("thinking");
  });

  it("mic denied or nothing heard: back to idle with a helpful message", async () => {
    const { s, p } = await load();
    p.ev.onUserSpeechStart(1);
    p.ev.onListenFailed?.("denied");
    expect(s().conv.state).toBe("idle");
    expect(s().micAvailable).toBe(false);
    expect(s().banner?.text).toMatch(/blocked/);
  });

  it("End clears trip state; Start again begins fresh in the classroom", async () => {
    const { session, s, p } = await load();
    session.sendText("mars");
    p.reply("r1", [["openWorld", { world: "mars" }]]);
    session.transitEvent("arrived");
    session.stop();
    expect(s().status).toBe("disconnected");
    await session.start();
    expect(s().world).toBe("classroom");
    expect(s().transit).toBeNull();
  });

  it("timeout fails the turn and silences any late reply", async () => {
    const { session, s, p } = await load();
    session.sendText("hi");
    vi.advanceTimersByTime(12500);
    expect(s().conv.state).toBe("idle");
    expect(s().results.at(-1)?.outcome).toBe("failed");
    expect(p.calls).toContain("interrupt");
    p.ev.onResponseCreated("late");
    expect(p.calls.filter((c) => c === "interrupt").length).toBeGreaterThanOrEqual(2);
  });

  it("reviewer H1: an interrupt never releases a queued line straight over the child", async () => {
    const { session, p } = await load();
    session.sendText("mars");
    p.reply("r1", [["openWorld", { world: "mars" }]], false); // still speaking
    session.transitEvent("arrived"); // queued behind the speech
    session.talk(); // child taps the mic: interrupt + listen
    expect(p.events.filter((e) => e.kind === "world_ready")).toHaveLength(0);
    p.ev.onUserSpeechStart(1);
    vi.advanceTimersByTime(2000);
    expect(p.events.filter((e) => e.kind === "world_ready")).toHaveLength(0); // still the child's turn
  });

  it("reviewer H1: tap-to-talk silences a line that is about to start even when the state says idle", async () => {
    const { session, p } = await load();
    const before = p.calls.filter((c) => c === "interrupt").length;
    session.talk();
    expect(p.calls.filter((c) => c === "interrupt").length).toBe(before + 1);
    expect(p.calls.at(-1)).toBe("listen");
  });

  it("reviewer H2: a queued arrival is delivered when the child's listen ends with silence", async () => {
    const { session, p } = await load();
    session.sendText("mars");
    p.reply("r1", [["openWorld", { world: "mars" }]]);
    p.ev.onUserSpeechStart(1); // listening
    session.transitEvent("arrived");
    p.ev.onListenFailed?.("no-speech");
    expect(p.events.at(-1)).toEqual({ kind: "world_ready", world: "mars" });
  });

  it("reviewer H3: a trip lands even if the 3D scene never reports arrival (no WebGL)", async () => {
    const { session, s, p } = await load();
    session.sendText("mars");
    p.reply("r1", [["openWorld", { world: "mars" }]]);
    expect(s().transit).not.toBeNull();
    vi.advanceTimersByTime(11000);
    expect(s().transit).toBeNull();
    expect(s().world).toBe("mars");
    expect(p.events.at(-1)).toEqual({ kind: "world_ready", world: "mars" });
  });

  it("reviewer M1: tapping the mic again cancels listening and returns to idle", async () => {
    const { session, s, p } = await load();
    session.talk();
    p.ev.onUserSpeechStart(1);
    expect(s().conv.state).toBe("listening");
    session.talk();
    expect(s().conv.state).toBe("idle");
    expect(p.calls).toContain("cancelListen");
  });
  it("tester R4-2: a failed mic tap puts the unanswered choices back", async () => {
    const { session, s, p } = await load();
    session.sendText("hi");
    p.reply("r1", [["offerChoices", { choices: [{ id: "mars", label: "Go to Mars" }, { id: "red", label: "Why red?" }] }]]);
    expect(s().choices).toHaveLength(2);
    session.talk();
    p.ev.onUserSpeechStart(1);
    p.ev.onListenFailed?.("no-speech");
    vi.advanceTimersByTime(2000);
    expect(s().choices.map((c) => c.id)).toEqual(["mars", "red"]);
    expect(p.events.some((e) => e.kind === "resume")).toBe(false); // silent, no extra speech
  });

  it("tester R4-3: Stop during the arrival line never strands the child", async () => {
    const { session, s, p } = await load();
    session.sendText("mars");
    p.reply("r1", [["offerChoices", { choices: [{ id: "x", label: "Old classroom choice" }] }], ["openWorld", { world: "mars" }]]);
    session.transitEvent("arrived");
    expect(s().world).toBe("mars");
    p.ev.onResponseCreated("a1");
    p.ev.onAudioStart("a1", 0);
    session.interrupt(); // Stop before the arrival's choices appear
    vi.advanceTimersByTime(2000);
    // No Mars prompt yet: ask for a short nudge rather than reviving classroom choices.
    expect(p.events.at(-1)).toEqual({ kind: "resume" });
    expect(s().choices.find((c) => c.id === "x")).toBeUndefined();
  });

  it("the stranded-guard stays quiet when the child is already doing something", async () => {
    const { session, s, p } = await load();
    session.sendText("hi");
    p.reply("r1", [["offerChoices", { choices: [{ id: "mars", label: "Go to Mars" }] }]], false);
    session.interrupt();
    session.sendText("what is mars"); // child typed straight away
    vi.advanceTimersByTime(2000);
    expect(p.events.some((e) => e.kind === "resume")).toBe(false);
    expect(s().choices).toHaveLength(0);
  });
});
