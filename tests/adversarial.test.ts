/**
 * Tester-added adversarial tests (round: worlds + scripted brain, commit 72e7bd5).
 * Tests named "FIXED:" were written by the tester as it.fails "KNOWN BUG" tests and
 * flipped to normal tests once the builder fixed the defect (2026-11-12).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceEvents, VoiceProvider, SessionInfo } from "@/lib/voice/provider";
import type { BrainContext, BrainInput, BrainReply } from "@/lib/brain/types";
import { ScriptedBrain } from "@/lib/brain/scriptedBrain";
import { emptyProfile, type LearnerProfile } from "@/lib/learner/profile";
import type { WorldId } from "@/lib/worlds/registry";

class Fake implements VoiceProvider {
  static last: Fake;
  readonly mode = "demo" as const;
  micAvailable = true;
  calls: string[] = [];
  events: BrainInput[] = [];
  constructor(public ev: VoiceEvents, public info: SessionInfo) { Fake.last = this; }
  async connect() { this.ev.onStatus("connecting"); this.ev.onStatus("connected"); }
  disconnect() { this.calls.push("disconnect"); this.ev.onStatus("disconnected"); }
  sendText(t: string) { this.calls.push(`text:${t}`); }
  sendEvent(i: BrainInput) { this.events.push(i); this.calls.push(`event:${i.kind}`); }
  interrupt() { this.calls.push("interrupt"); }
  greet() { this.calls.push("greet"); }
  listenOnce() { this.calls.push("listen"); this.ev.onUserSpeechStart(performance.now()); }
  cancelListening() { this.calls.push("cancelListen"); }
  setMicEnabled() {}
  getOutputLevel() { return 0; }
  getInputLevel() { return 0; }
  submitToolResult() {}
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
/** Start the Mars trip; the openWorld reply has finished speaking. */
async function flying() {
  const l = await load();
  l.session.sendText("mars");
  l.p.reply("r1", [["openWorld", { world: "mars" }]]);
  expect(l.s().transit).not.toBeNull();
  return l;
}

beforeEach(() => { store.clear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("adversarial: interrupting the space flight", () => {
  it("typing mid-flight, then arrival: the old turn's tool calls cannot change the scene; arrival is delivered", async () => {
    const { session, s, p } = await flying();
    session.sendText("are we there yet");
    p.reply("r2", [], false); // speaking
    session.transitEvent("arrived");
    expect(s().world).toBe("mars");
    // a late tool call from r1 (pre-flight turn) is stale
    p.ev.onToolCall("r1", "late", "openWorld", JSON.stringify({ world: "classroom" }));
    expect(s().transit).toBeNull();
    p.ev.onAudioStop("r2");
    expect(p.events.at(-1)).toEqual({ kind: "world_ready", world: "mars" });
  });

  it("rapid Stop presses mid-flight never stop the trip itself or move worlds", async () => {
    const { session, s, p } = await flying();
    session.transitEvent("cruise");
    p.reply("c1", [], false);
    for (let i = 0; i < 5; i++) session.interrupt();
    expect(s().transit).not.toBeNull();
    session.transitEvent("arrived");
    session.transitEvent("arrived"); // duplicate arrival from the scene is ignored
    expect(s().world).toBe("mars");
    expect(p.events.filter((e) => e.kind === "world_ready")).toHaveLength(1);
  });

  it("FIXED: tap-to-talk mid-flight that hears nothing swallows the arrival line (teacher silent on Mars, no choices)", async () => {
    const { session, s, p } = await flying();
    session.talk(); // listening
    expect(s().conv.state).toBe("listening");
    session.transitEvent("arrived"); // queued because the child is 'listening'
    p.ev.onListenFailed!("no-speech"); // listening -> idle, but flushQueued only runs on speaking -> idle
    expect(p.events.at(-1)).toEqual({ kind: "world_ready", world: "mars" });
  });

  it("FIXED: Stop while the teacher is still 'thinking' at arrival swallows the arrival line", async () => {
    const { session, p } = await flying();
    session.sendText("wow"); // thinking
    session.transitEvent("arrived"); // queued
    session.interrupt(); // thinking -> idle: not immediately (Stop means quiet)...
    expect(p.events.at(-1)?.kind).not.toBe("world_ready");
    vi.advanceTimersByTime(1300); // ...but the arrival line is not lost
    expect(p.events.at(-1)).toEqual({ kind: "world_ready", world: "mars" });
  });

  it("Stop during a reply mid-flight: the optional cruise remark is dropped (Stop means quiet)", async () => {
    const { session, p } = await flying();
    session.sendText("hello");
    p.reply("r2", [], false); // speaking
    session.transitEvent("cruise"); // queued
    session.interrupt();
    vi.advanceTimersByTime(3000);
    expect(p.events.some((e) => e.kind === "transit_cruise")).toBe(false);
  });
});

describe("adversarial: End during the flight, then Start again", () => {
  it("FIXED: End mid-flight leaves the trip running; the scene still 'arrives' on Mars while offline", async () => {
    const { session, s } = await flying();
    session.stop();
    expect(s().status).toBe("disconnected");
    expect(s().transit).toBeNull(); // fails: transit survives disconnect
  });

  it("Start after End mid-flight begins fresh in the classroom with no trip, choices or question", async () => {
    const { session, s } = await flying();
    session.stop();
    session.transitEvent("arrived"); // a late Director frame after End
    expect(s().world).toBe("classroom"); // End cleared the trip: nothing lands
    session.chooseTeacher("mia");
    await session.start();
    expect(s()).toMatchObject({ status: "connected", world: "classroom", transit: null, question: null, invite: null, inspecting: null, teacher: "mia" });
    expect(Fake.last.info.teacher).toBe("mia");
  });
});

describe("adversarial: rapid and out-of-order input", () => {
  it("double-tapping a choice or an answer sends it once", async () => {
    const { session, p } = await load();
    session.sendText("hi");
    p.reply("r1", [["offerChoices", { choices: [{ id: "mars", label: "Mars" }] }]]);
    session.choose("mars"); session.choose("mars"); session.choose("mars");
    expect(p.events.filter((e) => e.kind === "choice")).toHaveLength(1);
  });

  it("tapping the rock during the flight does nothing", async () => {
    const { session, p } = await flying();
    session.tap("rock_1");
    expect(p.events.filter((e) => e.kind === "tap")).toHaveLength(0);
  });

  it("FIXED: a typed answer to an open question leaves the question card on screen", async () => {
    const { session, s, p } = await flying();
    session.transitEvent("arrived");
    p.reply("a1", [["askQuestion", { questionId: "q_red" }]]);
    session.sendText("because of rust"); // brain answers it via keywords
    p.reply("r3", [["offerChoices", { choices: [{ id: "crater", label: "The crater" }] }]]);
    expect(s().question).toBeNull(); // fails: only answer() clears the question
  });
});

// ------------------------------------------------------------------ brain
function ctx(world: WorldId | "transit", profile: LearnerProfile = emptyProfile()): BrainContext & { profile: LearnerProfile } {
  return { world, teacher: "leo", teacherName: "Leo", profile, session: profile.sessions, record: (a) => profile.attempts.push({ ...a, at: "t" }) };
}
const said = (r: BrainReply) => r.segments.map((x) => x.say).join(" ");

describe("adversarial: scripted brain", () => {
  it("FIXED: 'take me back' typed during the flight answers 'We're already in the classroom'", () => {
    const r = new ScriptedBrain().respond({ kind: "text", text: "take me back" }, ctx("transit"));
    expect(said(r)).not.toMatch(/already in the classroom/);
  });

  it("FIXED: substring keywords record a CORRECT answer for 'I trust you' / 'environment'", () => {
    const c = ctx("mars");
    const b = new ScriptedBrain();
    b.respond({ kind: "tap", target: "rock_1" }, c);
    b.respond({ kind: "text", text: "I trust you" }, c);
    expect(c.profile.attempts.filter((a) => a.correct)).toHaveLength(0);
  });

  it("FIXED: 'not hot, it's rust' is not scored as 'hot': two answers heard → asked again, nothing recorded", () => {
    const c = ctx("mars");
    const b = new ScriptedBrain();
    b.respond({ kind: "tap", target: "rock_1" }, c);
    const r = b.respond({ kind: "text", text: "not hot, it's rust" }, c);
    expect(r.segments[0].say).toMatch(/more than one answer/);
    expect(c.profile.attempts).toHaveLength(0);
    b.respond({ kind: "text", text: "rust" }, c);
    expect(c.profile.attempts).toEqual([expect.objectContaining({ answerId: "rust", correct: true, hintsUsed: 0 })]);
  });

  it("FIXED: re-tapping the rock after a wrong answer resets hints, so a guesser never gets recorded as needing help", () => {
    const c = ctx("mars");
    const b = new ScriptedBrain();
    b.respond({ kind: "tap", target: "rock_1" }, c);
    b.respond({ kind: "answer", questionId: "q_red", optionId: "hot" }, c); // hint 1
    b.respond({ kind: "tap", target: "rock_1" }, c); // resets hints to 0
    b.respond({ kind: "answer", questionId: "q_red", optionId: "rust" }, c);
    expect(c.profile.attempts.at(-1)?.hintsUsed).toBe(1); // fails: 0 -> parent sees "right first try"
  });

  it("FIXED: answering the same question twice (card left open) records two attempts", () => {
    const c = ctx("mars");
    const b = new ScriptedBrain();
    b.respond({ kind: "tap", target: "rock_1" }, c);
    b.respond({ kind: "text", text: "iron rust" }, c);
    b.respond({ kind: "answer", questionId: "q_red", optionId: "rust" }, c); // child taps the still-open card
    expect(c.profile.attempts).toHaveLength(1);
  });

  it("FIXED: a typed answer to the later no-hint check ('rust') is not understood as an answer", () => {
    const p = emptyProfile();
    p.sessions = 2;
    p.attempts.push({ skill: "science.mars.red_color", questionId: "q_red", answerId: "rust", correct: true, hintsUsed: 1, context: "taught", at: "t" });
    const c = ctx("classroom", p);
    const b = new ScriptedBrain();
    b.respond({ kind: "session_start" }, c); // asks q_red_recall
    b.respond({ kind: "text", text: "rust" }, c);
    expect(p.attempts.filter((a) => a.context === "later_check")).toHaveLength(1);
  });

  it("hostile / odd typed text never throws and never emits an invalid action", async () => {
    const { parseSceneCommand } = await import("@/lib/scene/commands");
    const { contextFor } = await import("@/lib/worlds/registry");
    const odd = ["", " ", "🚀🚀🚀", "<script>alert(1)</script>", "x".repeat(5000), "openWorld({world:'http://evil'})", "ROCK!!!", "\u0000‮", "مرحبا", "stop stop stop", "back back"];
    for (const w of ["classroom", "mars", "transit"] as const) {
      const b = new ScriptedBrain();
      for (const t of odd) {
        const r = b.respond({ kind: "text", text: t }, ctx(w));
        for (const seg of r.segments) for (const a of seg.actions ?? []) {
          const v = parseSceneCommand(a.name, a.args, contextFor(w));
          if (a.name === "pointAt" && w === "transit") continue; // brain points at classroom globe in transit; validator rejects (logged below)
          expect(v.ok, `${w} "${t.slice(0, 20)}" ${a.name}`).toBe(true);
        }
      }
    }
  });
});
