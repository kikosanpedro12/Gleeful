import { describe, expect, it } from "vitest";
import { ScriptedBrain } from "@/lib/brain/scriptedBrain";
import type { BrainContext, BrainReply } from "@/lib/brain/types";
import { emptyProfile, type LearnerProfile } from "@/lib/learner/profile";
import { parseSceneCommand } from "@/lib/scene/commands";
import { contextFor, type WorldId } from "@/lib/worlds/registry";

/** Tester (eb045ac, Fair Share Market): typed input in every world must stay valid, honest and never strand the child. */
function ctx(world: WorldId | "transit", profile: LearnerProfile = emptyProfile()): BrainContext & { profile: LearnerProfile } {
  return {
    world, teacher: "leo", teacherName: "Leo", profile, session: profile.sessions,
    record: (a) => profile.attempts.push({ ...a, at: new Date().toISOString() }),
  };
}
const actions = (r: BrainReply) => r.segments.flatMap((s) => s.actions ?? []);
const said = (r: BrainReply) => r.segments.map((s) => s.say).join(" ");
const invalid = (r: BrainReply, world: WorldId) => {
  let w: WorldId | "transit" = world;
  const bad: string[] = [];
  for (const a of actions(r)) {
    const p = parseSceneCommand(a.name, a.args, contextFor(w));
    if (!p.ok) bad.push(`${a.name} ${JSON.stringify(a.args)}`);
    if (a.name === "openWorld") w = "transit";
  }
  return bad;
};
const NEXT_STEP = new Set(["offerChoices", "askQuestion", "inviteTap", "openWorld", "showWidget"]);

const PROBES = [
  "can I have an orange", "orange", "oranges", "share", "let's divide", "market", "mars", "go to the market",
  "back to class", "why is it red", "rock", "crater", "volcano", "where are the people", "hello", "yes", "ok",
  "fractions", "number line", "banana",
];
const WORLDS_TO_TRY: WorldId[] = ["classroom", "mars", "market"];

describe("tester: typed input in every world (scripted brain)", () => {
  for (const world of WORLDS_TO_TRY)
    for (const text of PROBES)
      it(`${world}: "${text}" → every action is valid for this world`, () => {
        const r = new ScriptedBrain().respond({ kind: "text", text }, ctx(world));
        expect(invalid(r, world)).toEqual([]);
      });

  for (const world of WORLDS_TO_TRY)
    for (const text of PROBES)
      it(`${world}: "${text}" → never claims "on our way" outside a trip, and leaves a next step`, () => {
        const r = new ScriptedBrain().respond({ kind: "text", text }, ctx(world));
        expect(said(r)).not.toMatch(/on our way/i);
        expect(actions(r).some((a) => NEXT_STEP.has(a.name)), said(r)).toBe(true);
      });

  it('market: "orange" is about the oranges, not Mars rocks', () => {
    const r = new ScriptedBrain().respond({ kind: "text", text: "can I have an orange" }, ctx("market"));
    expect(said(r)).not.toMatch(/rocks|fly there/i);
  });
});

describe("tester: exact-number answers", () => {
  const open = () => { const b = new ScriptedBrain(); const c = ctx("market"); b.respond({ kind: "tap", target: "crate" }, c); return { b, c }; };
  for (const t of ["14", "40", "4.5", "44", "fourteen", "forty", "1 4", "-4"]) // "1 4" and "-4" contain a bare 4 word: see below
    it(`"${t}" never records a CORRECT answer unless it contains the bare word 4/four`, () => {
      const { b, c } = open();
      b.respond({ kind: "text", text: t }, c);
      const bare = /(^|[^a-z0-9'])(4|four)([^a-z0-9']|$)/i.test(t);
      if (!bare) expect(c.profile.attempts.filter((a) => a.correct)).toHaveLength(0);
    });
  it('"four or six" records nothing and keeps the question open', () => {
    const { b, c } = open();
    const r = b.respond({ kind: "text", text: "four or six" }, c);
    expect(c.profile.attempts).toHaveLength(0);
    expect(actions(r)).toContainEqual({ name: "askQuestion", args: { questionId: "q_share" } });
  });
  it('a correct sentence "12 divided by 3 is 4" never records a WRONG answer', () => {
    const { b, c } = open();
    b.respond({ kind: "text", text: "12 divided by 3 is 4" }, c);
    expect(c.profile.attempts.filter((a) => !a.correct)).toHaveLength(0);
  });
  it("a stale q_share answer after leaving the market is refused and records nothing", () => {
    const b = new ScriptedBrain(); const c = ctx("market");
    b.respond({ kind: "tap", target: "crate" }, c);
    b.respond({ kind: "text", text: "back to class" }, c);
    const r = b.respond({ kind: "answer", questionId: "q_share", optionId: "four" }, ctx("classroom", c.profile));
    expect(c.profile.attempts).toHaveLength(0);
    expect(said(r)).toMatch(/finished/);
  });
  it("hostile answer ids are refused", () => {
    const b = new ScriptedBrain(); const c = ctx("market");
    b.respond({ kind: "tap", target: "crate" }, c);
    for (const [q, o] of [["__proto__", "four"], ["q_share", "__proto__"], ["q_share", "constructor"], ["toString", "x"]]) {
      b.respond({ kind: "answer", questionId: q, optionId: o }, c);
    }
    expect(c.profile.attempts).toHaveLength(0);
  });
});

describe("tester: recheck follows the trip just taken", () => {
  it("Mars (rock) then market (crate) in one session: back from the market asks the share recall", () => {
    const b = new ScriptedBrain(); const p = emptyProfile();
    b.respond({ kind: "world_ready", world: "mars" }, ctx("mars", p));
    b.respond({ kind: "tap", target: "rock_1" }, ctx("mars", p));
    b.respond({ kind: "answer", questionId: "q_red", optionId: "rust" }, ctx("mars", p));
    const h1 = b.respond({ kind: "world_ready", world: "classroom" }, ctx("classroom", p));
    expect(actions(h1)).toContainEqual({ name: "askQuestion", args: { questionId: "q_red_recall" } });
    b.respond({ kind: "answer", questionId: "q_red_recall", optionId: "rust" }, ctx("classroom", p));
    b.respond({ kind: "world_ready", world: "market" }, ctx("market", p));
    b.respond({ kind: "tap", target: "crate" }, ctx("market", p));
    b.respond({ kind: "answer", questionId: "q_share", optionId: "four" }, ctx("market", p));
    const h2 = b.respond({ kind: "world_ready", world: "classroom" }, ctx("classroom", p));
    expect(actions(h2)).toContainEqual({ name: "askQuestion", args: { questionId: "q_share_recall" } });
  });
  it("market trip WITHOUT tapping the crate after a Mars rock: no recheck of either skill", () => {
    const b = new ScriptedBrain(); const p = emptyProfile();
    b.respond({ kind: "world_ready", world: "mars" }, ctx("mars", p));
    b.respond({ kind: "tap", target: "rock_1" }, ctx("mars", p));
    b.respond({ kind: "answer", questionId: "q_red", optionId: "rust" }, ctx("mars", p));
    b.respond({ kind: "world_ready", world: "market" }, ctx("market", p)); // (test shortcut: no classroom stop)
    const h = b.respond({ kind: "world_ready", world: "classroom" }, ctx("classroom", p));
    expect(actions(h).some((a) => a.name === "askQuestion")).toBe(false);
  });
});
