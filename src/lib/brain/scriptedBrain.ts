import type { Action, Brain, BrainContext, BrainInput, BrainReply, Segment } from "./types";
import { WORLDS, type Question } from "@/lib/worlds/registry";
import { skillStatus } from "@/lib/learner/profile";

/**
 * SCRIPTED lesson brain — NOT AI. A deterministic Mars field-trip lesson used
 * to test presence, the world transition, interaction and interruption before
 * a model brain is connected. Understands only keyword intents; says so when
 * it does not understand.
 */
const A = (name: string, args: Record<string, unknown> = {}): Action => ({ name, args });
const S = (say: string, ...actions: Action[]): Segment => ({ say, actions });
const choices = (...c: [string, string][]) => A("offerChoices", { choices: c.map(([id, label]) => ({ id, label })) });

const INTENTS: [string, RegExp][] = [
  ["stop", /^(stop|wait|hold on|pause)\b/i],
  ["back", /\b(back|classroom|return|go home|leave)\b/i],
  ["red", /\b(red|rust|colou?r|orange)\b/i],
  ["crater", /\b(crater|hole|bowl)\b/i],
  ["mountain", /\b(mountain|volcano|olympus)\b/i],
  ["air", /\b(air|breathe|breath|people|live|alive|astronaut|spacesuit|human)\b/i],
  ["rock", /\b(rock|stone)\b/i],
  ["mars", /\b(mars|planet|space)\b/i],
  ["yes", /^(yes|yeah|yep|ok|okay|sure|let'?s go|go)\b/i],
  ["hello", /\b(hello|hi|hey)\b/i],
];
const SKILL = "science.mars.red_color";

/** Options whose keywords start a WORD in the text ("rusty" matches rust; "photo" does not match hot). */
export function matchOptions(text: string, q: Question) {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  return q.options.filter((o) => o.keywords.some((k) => words.some((w) => w.startsWith(k))));
}

export class ScriptedBrain implements Brain {
  readonly kind = "scripted" as const;
  private pending: { q: Question; hints: number } | null = null;
  private sawRock = false;
  /** How the recall question was asked this session: on the way back (same session) or at the start of a later one. */
  private recallContext: "recheck" | "later_check" = "recheck";
  /** Hints given per question this session: re-tapping the rock must not wipe them. */
  private hintsGiven: Record<string, number> = {};

  respond(input: BrainInput, ctx: BrainContext): BrainReply {
    switch (input.kind) {
      case "session_start": return this.greet(ctx);
      case "transit_cruise":
        return { segments: [S("See that little red dot? That's Mars, the fourth planet from the Sun.", A("pointAt", { target: "destination" }))] };
      case "world_ready": return this.arrived(input.world, ctx);
      case "resume":
        if (this.pending) return { segments: [S("Take your time. Which one do you pick?", A("askQuestion", { questionId: this.pending.q.id }))] };
        return { segments: [this.nudge(ctx)] };
      case "tap": return this.tap(input.target, ctx);
      case "answer": return this.answer(input.questionId, input.optionId, ctx);
      case "choice": return this.intent(input.id, input.label, ctx);
      case "text": {
        if (this.pending) {
          const hits = matchOptions(input.text, this.pending.q);
          if (hits.length === 1) return this.answer(this.pending.q.id, hits[0].id, ctx);
          if (hits.length > 1) // e.g. "not hot, rust": don't guess, and don't record anything
            return { segments: [S("I heard more than one answer there. Which one do you pick?", A("askQuestion", { questionId: this.pending.q.id }))] };
          // Anything else closes the open question (the card is cleared too).
          this.pending = null;
        }
        const hit = INTENTS.find(([, re]) => re.test(input.text));
        return this.intent(hit ? hit[0] : "unknown", input.text, ctx);
      }
    }
  }

  private greet(ctx: BrainContext): BrainReply {
    const status = skillStatus(ctx.profile.attempts, SKILL);
    const n = ctx.teacherName;
    if (ctx.profile.sessions > 1 && status.kind === "needs_check") {
      // Uses stored evidence, not a canned "I remember you".
      const hinted = status.detail.includes("hint");
      this.recallContext = "later_check";
      this.pending = { q: WORLDS.classroom.questions.q_red_recall, hints: 0 };
      return { segments: [
        S(`Welcome back! Last time on Mars you worked out why it looks red${hinted ? ", with a little hint" : ""}.`, A("gesture", { gesture: "wave" })),
        S("Let's see if it stuck. No hints this time.", A("askQuestion", { questionId: "q_red_recall" })),
      ] };
    }
    if (ctx.profile.sessions > 1 && status.kind === "independent") {
      return { segments: [
        S(`Hi again! You remembered why Mars is red without any help last time. Nice.`, A("gesture", { gesture: "wave" })),
        S("Want to visit Mars again?", choices(["mars", "Go to Mars"])),
      ] };
    }
    return { segments: [
      S(`Hi! I'm ${n}. Let's learn something amazing today.`, A("gesture", { gesture: "wave" })),
      S("What are we learning today?", choices(["mars", "I have homework about Mars"], ["red", "Why is Mars red?"])),
    ] };
  }

  private intent(intent: string, raw: string, ctx: BrainContext): BrainReply {
    const onMars = ctx.world === "mars";
    switch (intent) {
      case "stop":
        return { segments: [S("Okay. I'm listening.", A("gesture", { gesture: "nod" }))] };
      case "hello":
        return { segments: [S(`Hi! I'm ${ctx.teacherName}.`, A("gesture", { gesture: "wave" })), this.nudge(ctx)] };
      case "mars":
      case "yes":
        if (onMars) return { segments: [S("We're on Mars right now! Look around.", A("gesture", { gesture: "open_hands" })), this.nudge(ctx)] };
        if (ctx.world === "classroom")
          return { segments: [
            S("Mars! Instead of just talking about it, let's go and see it.", A("moveTeacherTo", { spot: "center" }), A("gesture", { gesture: "open_hands" })),
            S("Stay on the rug with me. Here we go!", A("openWorld", { world: "mars" })),
          ] };
        return { segments: [S("Hold on, we're on our way!")] };
      case "red":
        if (!onMars)
          return { segments: [
            S("Great question. The answer is hiding in the rocks.", A("pointAt", { target: "mars_globe" })),
            S("Want to fly there and find out?", choices(["mars", "Yes, let's go!"])),
          ] };
        return this.inviteRock();
      case "rock":
        return onMars ? this.inviteRock() : { segments: [S("The rocks we want are on Mars.", A("pointAt", { target: "mars_globe" })), S("Want to go?", choices(["mars", "Let's go!"]))] };
      case "air":
        return { segments: [
          S("No people live on Mars. Only robots called rovers have been there.", A("gesture", { gesture: "open_hands" })),
          S(onMars
            ? "The air is very thin, so people would need spacesuits. That's why we're wearing helmets on this pretend trip."
            : "The air there is very thin, so people would need spacesuits."),
          this.nudge(ctx),
        ] };
      case "crater":
        if (!onMars) break;
        this.pending = null;
        return { segments: [
          S("Let's walk to the crater.", A("moveTeacherTo", { spot: "crater_edge" })),
          S("This big bowl was made long ago, when a space rock crashed into Mars.", A("pointAt", { target: "crater" })),
          S("Where next?", choices(["mountain", "The giant volcano"], ["back", "Back to class"])),
        ] };
      case "mountain":
        if (!onMars) break;
        this.pending = null;
        return { segments: [
          S("Come over here and look far away.", A("moveTeacherTo", { spot: "mountain_view" })),
          S("That's Olympus Mons, the biggest volcano in our whole solar system. It isn't erupting now.", A("pointAt", { target: "mountain" })),
          S("Where next?", choices(["crater", "The crater"], ["back", "Back to class"])),
        ] };
      case "back":
        if (ctx.world === "transit") return { segments: [S("We're still flying. Hold on, we'll be there soon!")] };
        if (!onMars) return { segments: [S("We're already in the classroom."), this.nudge(ctx)] };
        this.pending = null;
        return { segments: [S("Time to head back to class. Hold on!", A("gesture", { gesture: "wave" }), A("openWorld", { world: "classroom" }))] };
    }
    // Honest fallback: say what this demo can do instead of bluffing.
    void raw;
    return { segments: [
      S("Good question! In this early version my lesson is scripted, so I can only take you on the Mars trip for now.", A("gesture", { gesture: "shrug" })),
      this.nudge(ctx),
    ] };
  }

  private nudge(ctx: BrainContext): Segment {
    if (ctx.world === "mars")
      return this.sawRock
        ? S("Want to explore more?", choices(["crater", "The crater"], ["mountain", "The volcano"], ["back", "Back to class"]))
        : S("What do you notice?", choices(["red", "Why is everything red?"], ["air", "Where are the people?"], ["crater", "What's that big hole?"]));
    return S("Shall we go to Mars?", choices(["mars", "Yes, go to Mars"]));
  }

  private inviteRock(): BrainReply {
    return { segments: [
      S("Let's be scientists and find out. See this rock?", A("moveTeacherTo", { spot: "rock_side" }), A("pointAt", { target: "rock_1" })),
      S("Tap it so we can look closer.", A("inviteTap", { target: "rock_1" })),
    ] };
  }

  private arrived(world: string, ctx: BrainContext): BrainReply {
    if (world === "mars")
      return { segments: [
        S("We made it! This is a pretend trip. Real astronauts need spacesuits, because there's almost no air on Mars.", A("gesture", { gesture: "open_hands" })),
        S("Look around. What do you notice?", choices(["red", "Everything is red!"], ["air", "Where are the people?"], ["crater", "What's that big hole?"])),
      ] };
    // Back in the classroom after a trip: unassisted check on a different question.
    const asked = this.sawRock && skillStatus(ctx.profile.attempts, SKILL).kind === "needs_check";
    if (asked) {
      this.recallContext = "recheck";
      this.pending = { q: WORLDS.classroom.questions.q_red_recall, hints: 0 };
    }
    if (asked) return { segments: [S("Welcome back to class!", A("gesture", { gesture: "wave" })), S("Quick check, no hints this time.", A("askQuestion", { questionId: "q_red_recall" }))] };
    return { segments: [S("Welcome back to class!", A("gesture", { gesture: "wave" })), S("Want to go again?", choices(["mars", "Go to Mars again"]))] };
  }

  private tap(target: string, ctx: BrainContext): BrainReply {
    if (target !== "rock_1" || ctx.world !== "mars") return { segments: [S("Hmm, let's look at something else.")] };
    this.sawRock = true;
    this.pending = { q: WORLDS.mars.questions.q_red, hints: this.hintsGiven.q_red ?? 0 };
    return { segments: [
      S("Nice! You can spin it with your finger. See the orange dust on it?", A("gesture", { gesture: "nod" })),
      S("Rocks and dust on Mars have iron in them. Over a very, very long time, the iron rusted."),
      S("So, why do you think Mars looks red?", A("askQuestion", { questionId: "q_red" })),
    ] };
  }

  private answer(questionId: string, optionId: string, ctx: BrainContext): BrainReply {
    const q = WORLDS.mars.questions[questionId] ?? WORLDS.classroom.questions[questionId];
    const opt = q?.options.find((o) => o.id === optionId);
    if (!q || !opt) return { segments: [S("Hmm, I didn't catch that answer.")] };
    // Only the open question can be answered (no double-recording from a stale card).
    if (!this.pending || this.pending.q.id !== questionId)
      return { segments: [S("That question is finished. Let's keep going!"), this.nudge(ctx)] };
    const later = questionId === "q_red_recall";
    if (later) {
      this.pending = null;
      ctx.record({ skill: q.skill, questionId, answerId: optionId, correct: opt.correct, hintsUsed: 0, context: this.recallContext });
      const praise = this.recallContext === "later_check" ? "And you remembered it from last time, all by yourself." : "No hints needed. We'll check again another day.";
      return opt.correct
        ? { segments: [S(`Yes! Iron that rusted. ${praise}`, A("gesture", { gesture: "thumbs_up" })), S("Want to go back to Mars?", choices(["mars", "Go to Mars"]))] }
        : { segments: [S(`Not quite. ${q.explain}`, A("gesture", { gesture: "open_hands" })), S("We'll check it again another day. Want to see the rocks again?", choices(["mars", "Go to Mars"]))] };
    }
    const p = this.pending && this.pending.q.id === questionId ? this.pending : { q, hints: 0 };
    if (opt.correct) {
      this.pending = null;
      ctx.record({ skill: q.skill, questionId, answerId: optionId, correct: true, hintsUsed: p.hints, context: "taught" });
      return { segments: [
        S(p.hints ? "Yes, that's it! Rusted iron makes Mars look red." : "Yes! Rusted iron. You figured that out yourself.", A("gesture", { gesture: "thumbs_up" })),
        S("Where should we explore next?", choices(["crater", "The crater"], ["mountain", "The giant volcano"])),
      ] };
    }
    if (p.hints === 0) {
      this.pending = { q, hints: 1 };
      this.hintsGiven[questionId] = 1;
      return { segments: [S(`Good guess, but not quite. ${q.hint}`, A("gesture", { gesture: "think" })), S("Try again.", A("askQuestion", { questionId }))] };
    }
    this.pending = null;
    ctx.record({ skill: q.skill, questionId, answerId: optionId, correct: false, hintsUsed: p.hints, context: "taught" });
    return { segments: [
      S(`That's okay, this one is tricky. ${q.explain}`, A("pointAt", { target: "rock_1" })),
      S("Let's keep exploring.", choices(["crater", "The crater"], ["mountain", "The giant volcano"])),
    ] };
  }
}
