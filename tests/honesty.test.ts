import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OnboardingView } from "@/components/Hud";
import { previewLine } from "@/lib/voice/preview";
import { probeBrain, resetReach, useReach } from "@/lib/brain/reach";
import { setTesterCode } from "@/lib/brain/tester";
import { ScriptedBrain } from "@/lib/brain/scriptedBrain";
import type { BrainContext, BrainInput } from "@/lib/brain/types";
import { emptyProfile } from "@/lib/learner/profile";

/**
 * The badge says "Scripted · not AI" whenever the script answers, so nothing the
 * script SAYS may call the teacher an AI. (Model builds disclose AI in their own copy.)
 */
const CLAIM = /\b(AI|artificial intelligence|robot|chatbot)\b/i;
const ctx = (world: "classroom" | "mars"): BrainContext => {
  const profile = emptyProfile();
  return { world, teacher: "mia", teacherName: "Mia", profile, session: 0, record: (a) => profile.attempts.push({ ...a, at: new Date().toISOString() }) } as BrainContext;
};

describe("scripted lesson never claims to be AI", () => {
  const inputs: [BrainInput, "classroom" | "mars"][] = [
    [{ kind: "session_start" }, "classroom"],
    [{ kind: "text", text: "Why is Mars red?" }, "classroom"],
    [{ kind: "text", text: "are you an AI?" }, "classroom"],
    [{ kind: "text", text: "hello" }, "classroom"],
    [{ kind: "transit_cruise", to: "mars" }, "classroom"],
    [{ kind: "world_ready", world: "mars" }, "mars"],
    [{ kind: "world_ready", world: "classroom" }, "classroom"],
    [{ kind: "text", text: "show me a crater" }, "mars"],
    [{ kind: "text", text: "go back to class" }, "mars"],
    [{ kind: "resume" }, "mars"],
  ];
  for (const [input, world] of inputs) {
    it(`${input.kind} ${"text" in input ? input.text : ""} in ${world}`, () => {
      const r = new ScriptedBrain().respond(input, ctx(world));
      for (const s of r.segments) expect(s.say ?? "", s.say).not.toMatch(CLAIM);
    });
  }
});

/**
 * What the visitor SEES and HEARS before the lesson must match what will answer.
 * Rendered for real (react-dom/server), not matched against source text.
 * The four deployments: scripted build; model build with no key; model build +
 * key + tester gate + no code (the planned private-test setup); and with a valid code.
 */
describe("start screen and voice preview claim AI only when this visitor can reach it", () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } });
    resetReach();
  });
  afterEach(() => { vi.unstubAllGlobals(); resetReach(); });

  const probe = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
  const screen = () => renderToStaticMarkup(createElement(OnboardingView, { ai: useReach.getState().ai }));
  const heard = () => previewLine("mia", useReach.getState().ai) + " " + previewLine("leo", useReach.getState().ai);
  const NOT_AI = (html: string) => { expect(html).not.toMatch(/AI teachers|from an AI|Claude/); expect(html).toMatch(/scripted, not AI/); };

  it("before the probe answers: scripted copy", () => { NOT_AI(screen()); expect(heard()).not.toMatch(CLAIM); });
  it("scripted build: never probes, never claims AI", async () => {
    const f = vi.fn(probe({ configured: true, testerRequired: false }));
    await probeBrain(f, "/api/brain", false);
    NOT_AI(screen()); expect(heard()).not.toMatch(CLAIM);
  });
  it("model build, no key: no AI claim", async () => {
    await probeBrain(probe({ configured: false, testerRequired: false }), "/api/brain", true);
    NOT_AI(screen()); expect(heard()).not.toMatch(CLAIM);
  });
  it("model build, probe fails: no AI claim", async () => {
    await probeBrain((async () => { throw new TypeError("offline"); }) as unknown as typeof fetch, "/api/brain", true);
    NOT_AI(screen()); expect(heard()).not.toMatch(CLAIM);
  });
  it("model build + key + tester gate + NO code (planned Vercel setup): no AI claim", async () => {
    await probeBrain(probe({ configured: true, testerRequired: true }), "/api/brain", true);
    NOT_AI(screen()); expect(heard()).not.toMatch(CLAIM);
  });
  it("model build + key + gate + a tester code: discloses AI", async () => {
    setTesterCode("kiko-private-test-7f3a9c");
    await probeBrain(probe({ configured: true, testerRequired: true }), "/api/brain", true);
    const html = screen();
    expect(html).toMatch(/Leo and Mia are AI teachers/);
    expect(html).toMatch(/answers come from an AI \(Claude\)/);
    expect(heard()).toMatch(/I'm an AI teacher/);
  });
  it("model build + key, gate off: discloses AI", async () => {
    await probeBrain(probe({ configured: true, testerRequired: false }), "/api/brain", true);
    expect(screen()).toMatch(/AI teachers/);
  });
});
