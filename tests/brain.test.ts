import { describe, expect, it } from "vitest";
import { ScriptedBrain } from "@/lib/brain/scriptedBrain";
import type { BrainContext, BrainReply } from "@/lib/brain/types";
import { emptyProfile, skillStatus, type LearnerProfile } from "@/lib/learner/profile";
import { parseSceneCommand } from "@/lib/scene/commands";
import { contextFor, type WorldId } from "@/lib/worlds/registry";

function ctx(world: WorldId | "transit", profile: LearnerProfile = emptyProfile()): BrainContext & { profile: LearnerProfile } {
  return {
    world, teacher: "leo", teacherName: "Leo", profile, session: profile.sessions,
    record: (a) => profile.attempts.push({ ...a, at: new Date().toISOString() }),
  };
}
const actions = (r: BrainReply) => r.segments.flatMap((s) => s.actions ?? []);
const names = (r: BrainReply) => actions(r).map((a) => a.name);

/** Every action the scripted brain emits must pass the same validator a model would face. */
function allValid(r: BrainReply, world: WorldId | "transit") {
  let w = world;
  for (const a of actions(r)) {
    const p = parseSceneCommand(a.name, a.args, contextFor(w));
    expect(p.ok, `${a.name} ${JSON.stringify(a.args)} in ${w}: ${!p.ok ? p.error : ""}`).toBe(true);
    if (a.name === "openWorld") w = "transit";
  }
}

describe("scripted brain (not AI): the Mars field trip", () => {
  it("greets a new child with a choice and validates every action", () => {
    const r = new ScriptedBrain().respond({ kind: "session_start" }, ctx("classroom"));
    expect(names(r)).toContain("offerChoices");
    expect(r.segments[0].say).toMatch(/Leo/);
    allValid(r, "classroom");
  });
  it("homework about Mars → flies to Mars", () => {
    const r = new ScriptedBrain().respond({ kind: "text", text: "I have science homework about Mars" }, ctx("classroom"));
    expect(names(r)).toContain("openWorld");
    allValid(r, "classroom");
  });
  it("on arrival says it is a simulation and that people need spacesuits", () => {
    const r = new ScriptedBrain().respond({ kind: "world_ready", world: "mars" }, ctx("mars"));
    const said = r.segments.map((s) => s.say).join(" ");
    expect(said).toMatch(/pretend/i);
    expect(said).toMatch(/spacesuit/i);
    allValid(r, "mars");
  });
  it("'why is it red?' on Mars → walks to the rock and invites a tap", () => {
    const r = new ScriptedBrain().respond({ kind: "text", text: "why is it red?" }, ctx("mars"));
    expect(names(r)).toEqual(expect.arrayContaining(["moveTeacherTo", "pointAt", "inviteTap"]));
    allValid(r, "mars");
  });
  it("tapping the rock changes the lesson: explains, then asks a checkable question", () => {
    const b = new ScriptedBrain();
    const r = b.respond({ kind: "tap", target: "rock_1" }, ctx("mars"));
    expect(actions(r).find((a) => a.name === "askQuestion")?.args).toEqual({ questionId: "q_red" });
    allValid(r, "mars");
  });
  it("wrong answer gets a hint (not praise); right answer afterwards is recorded WITH the hint", () => {
    const b = new ScriptedBrain();
    const c = ctx("mars");
    b.respond({ kind: "tap", target: "rock_1" }, c);
    const wrong = b.respond({ kind: "answer", questionId: "q_red", optionId: "hot" }, c);
    expect(wrong.segments[0].say).toMatch(/not quite/i);
    expect(wrong.segments[0].say).toMatch(/cold/i);
    expect(c.profile.attempts).toHaveLength(0);
    b.respond({ kind: "answer", questionId: "q_red", optionId: "rust" }, c);
    expect(c.profile.attempts).toEqual([expect.objectContaining({ correct: true, hintsUsed: 1, context: "taught" })]);
    expect(skillStatus(c.profile.attempts, "science.mars.red_color").kind).toBe("needs_check");
  });
  it("spoken answers are matched by keyword while a question is open", () => {
    const b = new ScriptedBrain();
    const c = ctx("mars");
    b.respond({ kind: "tap", target: "rock_1" }, c);
    b.respond({ kind: "text", text: "because the iron got rusty" }, c);
    expect(c.profile.attempts[0]).toMatchObject({ correct: true, hintsUsed: 0 });
  });
  it("unknown questions get an honest 'scripted' reply, not a bluff", () => {
    const r = new ScriptedBrain().respond({ kind: "text", text: "what is the capital of Peru?" }, ctx("mars"));
    expect(r.segments[0].say).toMatch(/scripted/i);
  });
  it("crater / volcano / back are real world changes with valid actions", () => {
    const b = new ScriptedBrain();
    for (const id of ["crater", "mountain"]) {
      const r = b.respond({ kind: "choice", id, label: id }, ctx("mars"));
      expect(names(r)).toContain("moveTeacherTo");
      allValid(r, "mars");
    }
    const back = b.respond({ kind: "choice", id: "back", label: "Back to class" }, ctx("mars"));
    expect(actions(back).find((a) => a.name === "openWorld")?.args).toEqual({ world: "classroom" });
  });
  it("back in class: a same-session recheck; a later session: the real later check", () => {
    const b = new ScriptedBrain();
    const c = ctx("mars");
    b.respond({ kind: "tap", target: "rock_1" }, c);
    b.respond({ kind: "answer", questionId: "q_red", optionId: "rust" }, c);
    const r = b.respond({ kind: "world_ready", world: "classroom" }, ctx("classroom", c.profile));
    expect(actions(r).find((a) => a.name === "askQuestion")?.args).toEqual({ questionId: "q_red_recall" });
    allValid(r, "classroom");
    b.respond({ kind: "answer", questionId: "q_red_recall", optionId: "rust" }, ctx("classroom", c.profile));
    // Minutes later in the same session: a recheck, NOT evidence of independence.
    expect(c.profile.attempts.at(-1)).toMatchObject({ context: "recheck", hintsUsed: 0, correct: true });
    expect(skillStatus(c.profile.attempts, "science.mars.red_color").kind).toBe("needs_check");
    // Next session: a later check. Only this counts as doing it on their own.
    c.profile.sessions = 2;
    const b2 = new ScriptedBrain();
    const g = b2.respond({ kind: "session_start" }, ctx("classroom", c.profile));
    expect(actions(g).find((x) => x.name === "askQuestion")?.args).toEqual({ questionId: "q_red_recall" });
    b2.respond({ kind: "text", text: "the iron got rusty" }, ctx("classroom", c.profile));
    expect(c.profile.attempts.at(-1)).toMatchObject({ context: "later_check", correct: true });
    expect(skillStatus(c.profile.attempts, "science.mars.red_color").kind).toBe("independent");
  });
  it("a later session greets from STORED evidence, not a canned 'I remember you'", () => {
    const p = emptyProfile();
    p.sessions = 2;
    p.attempts.push({ skill: "science.mars.red_color", questionId: "q_red", answerId: "rust", correct: true, hintsUsed: 1, context: "taught", at: "x" });
    const r = new ScriptedBrain().respond({ kind: "session_start" }, ctx("classroom", p));
    expect(r.segments[0].say).toMatch(/with a little hint/);
    expect(actions(r).find((a) => a.name === "askQuestion")?.args).toEqual({ questionId: "q_red_recall" });
    const fresh = new ScriptedBrain().respond({ kind: "session_start" }, ctx("classroom", { ...emptyProfile(), sessions: 2 }));
    expect(fresh.segments[0].say).not.toMatch(/last time/i);
  });
});

describe("learner status is honest", () => {
  const a = (o: Partial<LearnerProfile["attempts"][number]>) => ({ skill: "s", questionId: "q", answerId: "a", correct: true, hintsUsed: 0, context: "taught" as const, at: "x", ...o });
  it("one assisted correct answer is NOT mastery", () => {
    expect(skillStatus([a({ hintsUsed: 2 })], "s").kind).toBe("needs_check");
  });
  it("a failed later check outranks earlier success", () => {
    expect(skillStatus([a({}), a({ context: "later_check", correct: false })], "s").kind).toBe("learning");
  });
  it("only a correct later check counts as independent", () => {
    expect(skillStatus([a({ correct: false }), a({ context: "later_check" })], "s").kind).toBe("independent");
    expect(skillStatus([], "s").kind).toBe("not_seen");
  });
});

import { skillLabel } from "@/lib/learner/profile";
describe("tester R4-1: skill labels are prototype-safe", () => {
  it("returns plain strings for hostile keys", () => {
    for (const k of ["__proto__", "constructor", "toString", "hasOwnProperty"]) expect(skillLabel(k)).toBe(k);
    expect(skillLabel("science.mars.red_color")).toBe("Why Mars looks red");
  });
});
