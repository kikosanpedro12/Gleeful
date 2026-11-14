import { describe, expect, it, vi } from "vitest";
import { ScriptedProvider } from "@/lib/voice/scriptedProvider";
import type { Brain } from "@/lib/brain/types";
import type { VoiceEvents } from "@/lib/voice/provider";
import { buildReply, stripIntro } from "@/lib/brain/server/sanitize";
import { buildUserMessage } from "@/lib/brain/server/prompt";
import type { BrainRequest } from "@/lib/brain/protocol";

describe("the teacher introduces themself only at session start", () => {
  it("strips an opening introduction and keeps the rest", () => {
    expect(stripIntro("Hi, I'm Leo, an AI teacher! Look at those stars.")).toBe("Look at those stars.");
    expect(stripIntro("Hello there, I am Mia. We are flying!")).toBe("We are flying!");
    expect(stripIntro("My name is Leo. Ready?")).toBe("Ready?");
  });
  it("leaves ordinary lines alone", () => {
    expect(stripIntro("Leo thinks the rock is red because of iron.")).toBe("Leo thinks the rock is red because of iron.");
    expect(stripIntro("Look, I'm so excited to see Mars!")).toBe("Look, I'm so excited to see Mars!");
  });
  const blocks = [{ type: "text", text: "Hi, I'm Leo, an AI teacher! Mars is getting bigger." }];
  it("drops the intro from a mid-flight line but keeps it in the opening greeting", () => {
    const mid = buildReply(blocks, "transit", { kind: "transit_cruise", to: "mars" });
    expect(mid?.segments[0].say).toBe("Mars is getting bigger.");
    const start = buildReply(blocks, "classroom", { kind: "session_start" });
    expect(start?.segments[0].say).toMatch(/I'm Leo/);
  });
  it("keeps the honest AI answer when the child asks who the teacher is", () => {
    const r = buildReply([{ type: "text", text: "I'm Leo, an AI teacher, not a person." }], "mars", { kind: "text", text: "are you a robot?" });
    expect(r?.segments[0].say).toBe("I'm Leo, an AI teacher, not a person.");
    expect(buildReply([{ type: "text", text: "My name is Mia!" }], "mars", { kind: "text", text: "what's your name?" })?.segments[0].say).toBe("My name is Mia!");
  });
  it("strips a re-intro after taps, choices, answers and widgets, but not a sentence that carries other content", () => {
    for (const kind of [{ kind: "tap", target: "rock" }, { kind: "choice", id: "x", label: "Yes" }, { kind: "resume" }] as const)
      expect(buildReply([{ type: "text", text: "Hi, I'm Leo, your AI teacher! The rock is red." }], "mars", kind)?.segments[0].say).toBe("The rock is red.");
    expect(stripIntro("Hi friend, I’m Mia! Look up.")).toBe("Look up.");
    expect(stripIntro("I'm Leo, and this crater is huge!")).toBe("I'm Leo, and this crater is huge!");
  });
  it("does not strip a possessive that merely starts with the name", () => {
    expect(stripIntro("This is Mia's favorite rock. Look!")).toBe("This is Mia's favorite rock. Look!");
  });
  it("a reply that was only an introduction is dropped entirely", () => {
    expect(buildReply([{ type: "text", text: "Hi, I'm Leo, your AI teacher." }], "transit", { kind: "transit_cruise", to: "mars" })).toBeNull();
  });
  it("the prompt tells the model not to re-introduce, except at session start", () => {
    const base = { v: 1, learnerId: "l", sessionId: "s", tz: "Asia/Manila", world: "transit", teacher: "leo", session: 1, hintsUsed: 0, history: [], skills: [] } as const;
    expect(buildUserMessage({ ...base, input: { kind: "transit_cruise", to: "mars" } } as unknown as BrainRequest)).toMatch(/Do not introduce yourself/);
    expect(buildUserMessage({ ...base, world: "classroom", input: { kind: "session_start" } } as unknown as BrainRequest)).not.toMatch(/Do not introduce yourself/);
  });
});

function harness(brain: Brain, world: () => string) {
  const log: string[] = [];
  const ev = new Proxy({
    onAudioStart: () => log.push("audio"),
    onReplyDropped: (_: string, r: string) => log.push(`dropped:${r}`),
  } as unknown as VoiceEvents, { get: (t, p) => (p in t ? (t as never)[p] : vi.fn()) });
  const learner = { startSession: async () => undefined, recordAttempt: async () => {} } as never;
  const p = new ScriptedProvider(ev, { teacher: "leo", world: world as never }, brain, learner);
  return { p, log };
}
const slow = (ms: number): Brain => ({ kind: "model", respond: () => new Promise((r) => setTimeout(() => r({ segments: [{ say: "Hello there." }] }), ms)) });

describe("late AI replies are dropped, not spoken", () => {
  it("a flight remark that arrives after we landed is dropped", async () => {
    const { p, log } = harness(slow(30), () => "mars");
    p.sendEvent({ kind: "transit_cruise", to: "mars" });
    await vi.waitFor(() => expect(log).toContain("dropped:late"));
    await new Promise((r) => setTimeout(r, 600));
    expect(log).not.toContain("audio");
    p.disconnect();
  });
  it("a flight remark that arrives in time, while still flying, is spoken", async () => {
    const { p, log } = harness(slow(30), () => "transit");
    p.sendEvent({ kind: "transit_cruise", to: "mars" });
    await vi.waitFor(() => expect(log).toContain("audio"), { timeout: 5000 });
    expect(log).not.toContain("dropped:late");
    p.disconnect();
  });
  it("an arrival line for a world we already left is dropped; for the current world it is spoken", async () => {
    const left = harness(slow(10), () => "classroom");
    left.p.sendEvent({ kind: "world_ready", world: "mars" });
    await vi.waitFor(() => expect(left.log).toContain("dropped:late"));
    left.p.disconnect();
    const here = harness(slow(10), () => "mars");
    here.p.sendEvent({ kind: "world_ready", world: "mars" });
    await vi.waitFor(() => expect(here.log).toContain("audio"), { timeout: 5000 });
    here.p.disconnect();
  });
  it("ordinary turns are never dropped as late", async () => {
    const { p, log } = harness(slow(10), () => "classroom");
    p.sendText("hi");
    await vi.waitFor(() => expect(log).toContain("audio"), { timeout: 5000 });
    expect(log).not.toContain("dropped:late");
    p.disconnect();
  });
});
