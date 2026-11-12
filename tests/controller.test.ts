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
});
