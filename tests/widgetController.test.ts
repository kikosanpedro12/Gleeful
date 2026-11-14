import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceEvents, VoiceProvider, SessionInfo } from "@/lib/voice/provider";
import type { BrainInput } from "@/lib/brain/types";

class Fake implements VoiceProvider {
  static last: Fake;
  readonly mode = "demo" as const;
  micAvailable = true;
  events: BrainInput[] = [];
  results: string[] = [];
  constructor(public ev: VoiceEvents, public info: SessionInfo) { Fake.last = this; }
  async connect() { this.ev.onStatus("connecting"); this.ev.onStatus("connected"); }
  disconnect() { this.ev.onStatus("disconnected"); }
  sendText() {}
  sendEvent(i: BrainInput) { this.events.push(i); }
  interrupt() {}
  greet() {}
  listenOnce() {}
  cancelListening() {}
  setMicEnabled() {}
  getOutputLevel() { return 0; }
  getInputLevel() { return 0; }
  submitToolResult(_id: string, out: string) { this.results.push(out); }
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
  Fake.last.reply("greeting");
  return { session, s: () => useSession.getState(), p: Fake.last };
}
beforeEach(() => { store.clear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

/** A real teacher turn: the child says something, then the reply plays. */
const ask = (session: { sendText(t: string): void }, p: Fake, id: string, tools: [string, object][], stop = true) => { session.sendText("hi"); p.reply(id, tools, stop); };

const NL = { widget: "number_line", min: 0, max: 1, step: 0.25, format: "fraction", denominator: 4, target: 0.75 };

describe("teaching widget in the session", () => {
  it("showWidget puts it on screen and hideWidget removes it", async () => {
    const { s, p, session } = await load();
    ask(session, p, "r1", [["showWidget", NL]], false);
    expect(s().widget?.spec.kind).toBe("number_line");
    expect(p.results.at(-1)).toContain('"ok":true');
    p.ev.onToolCall("r1", "c2", "hideWidget", "{}");
    expect(s().widget).toBeNull();
  });
  it("a bad widget is refused and never shown", async () => {
    const { s, p, session } = await load();
    ask(session, p, "r1", [["showWidget", { ...NL, step: 0 }]], false);
    expect(s().widget).toBeNull();
    expect(s().rejectedCommands).toBe(1);
  });
  it("a widget call from an interrupted turn is dropped", async () => {
    const { s, p, session } = await load();
    session.sendText("hi");
    p.ev.onResponseCreated("r1");
    p.ev.onAudioStart("r1", 0);
    session.interrupt();
    p.ev.onToolCall("r1", "c1", "showWidget", JSON.stringify(NL));
    expect(s().widget).toBeNull();
    expect(s().staleDropped).toBeGreaterThan(0);
  });
  it("the child's setting goes back as a turn that carries the target", async () => {
    const { s, p, session } = await load();
    ask(session, p, "r1", [["showWidget", NL]]);
    session.widgetAnswer("number_line", "3/4", "3/4", "(put the marker at 3/4)");
    expect(p.events.at(-1)).toEqual({ kind: "widget", widget: "number_line", value: "3/4", target: "3/4" });
    expect(s().conv.state).toBe("thinking");
    expect(s().widget).not.toBeNull(); // it stays so the child can try again
  });
  it("travelling, ending, and a new session clear it", async () => {
    const { s, p, session } = await load();
    ask(session, p, "a", [["showWidget", NL]]);
    expect(s().widget).not.toBeNull();
    session.stop();
    expect(s().widget).toBeNull();
    await session.start();
    expect(s().widget).toBeNull();
  });
});
