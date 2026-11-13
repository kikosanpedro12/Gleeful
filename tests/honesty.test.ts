import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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
  it("voice preview only says 'AI teacher' in model builds", () => {
    const src = readFileSync("src/lib/voice/preview.ts", "utf8");
    expect(src).not.toMatch(/"Hi, I'm (Leo|Mia)! I'm an AI teacher/);
    expect(src).toMatch(/MODEL_BUILD \? " I'm an AI teacher\." : ""/);
  });
  it("start screen and HUD only call the teacher AI in model builds", () => {
    const hud = readFileSync("src/components/Hud.tsx", "utf8");
    for (const line of hud.split("\n").filter((l) => /AI teacher/.test(l))) expect(line, line).toMatch(/MODEL_BUILD|brainKind === "model"|title=/);
  });
});
