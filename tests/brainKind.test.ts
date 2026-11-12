import { describe, expect, it, vi } from "vitest";
import { ScriptedProvider } from "@/lib/voice/scriptedProvider";
import { FallbackBrain } from "@/lib/brain/fallbackBrain";
import { ScriptedBrain } from "@/lib/brain/scriptedBrain";
import type { Brain } from "@/lib/brain/types";
import type { VoiceEvents } from "@/lib/voice/provider";
import { useSession, initialStore } from "@/lib/session/store";

const events = (kinds: string[]): VoiceEvents => new Proxy({ onBrainKind: (k: string) => kinds.push(k) } as unknown as VoiceEvents, {
  get: (t, p) => (p in t ? (t as never)[p] : vi.fn()),
});
const learner = { startSession: async () => undefined, recordAttempt: async () => {} } as never;
const model: Brain = { kind: "model", respond: () => ({ segments: [{ say: "Hello from the model." }] }) };
const broken: Brain = { kind: "model", respond: () => { throw Object.assign(new Error("x"), { code: "brain_unconfigured" }); } };

async function turn(brain: Brain) {
  const kinds: string[] = [];
  const p = new ScriptedProvider(events(kinds), { teacher: "leo", world: () => "classroom" }, brain, learner);
  p.sendText("hello");
  await vi.waitFor(() => expect(kinds.length).toBeGreaterThan(0));
  p.disconnect();
  return kinds;
}

describe("the on-screen AI badge follows who actually answered", () => {
  it("model answered -> 'model'", async () => {
    expect(await turn(new FallbackBrain(model, new ScriptedBrain()))).toEqual(["model"]);
  });
  it("model failed, script answered -> 'scripted' (never claims AI)", async () => {
    expect(await turn(new FallbackBrain(broken, new ScriptedBrain()))).toEqual(["scripted"]);
  });
  it("a plain scripted brain reports 'scripted'", async () => {
    expect(await turn(new ScriptedBrain())).toEqual(["scripted"]);
  });
  it("the store starts with no claim at all", () => {
    expect(initialStore().brainKind).toBeNull();
    expect(useSession.getState().brainKind).toBeNull();
  });
});
