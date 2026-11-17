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

describe("tester (eb045ac): Stop right after tapping an object never strands the child", () => {
  it("tap the crate, Stop before the question arrives, put it back → something to answer or tap comes back", async () => {
    const { session, s, p } = await load();
    session.sendText("sharing");
    p.reply("r1", [["openWorld", { world: "market" }]]);
    session.transitEvent("arrived");
    expect(s().world).toBe("market");
    p.reply("a1", [["inviteTap", { target: "crate" }]]);
    session.tap("crate");
    expect(s().inspecting).toBe("crate");
    p.reply("t1", [["moveTeacherTo", { spot: "basket_side" }]], false); // first line of the tap reply is playing
    session.interrupt(); // Stop before "How many in each basket?" is asked
    vi.advanceTimersByTime(2000);
    session.closeInspect(); // the only thing left on screen is the inspect card; the child puts it back
    vi.advanceTimersByTime(4000);
    const st = s();
    const prompted = st.choices.length > 0 || !!st.question || !!st.invite || p.events.some((e) => e.kind === "resume");
    expect(prompted, "nothing to answer or tap, and no resume asked").toBe(true);
  });
});
