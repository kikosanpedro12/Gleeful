import type { Action, Brain, BrainContext, BrainInput, BrainReply, Segment } from "./types";
import { WORLDS, type Question } from "@/lib/worlds/registry";
import { skillStatus } from "@/lib/learner/profile";
import { matches } from "@/lib/widgets/spec";

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
  ["numberline", /number ?line/i],
  ["fractions", /\b(fractions?|halves|half|quarters?)\b/i],
  ["market", /\b(market|shar(e|ing)|divid(e|ing)|division|equal groups?|fair share|oranges?)\b/i],
  ["mars", /\b(mars|planet|space)\b/i],
  ["yes", /^(yes|yeah|yep|ok|okay|sure|let'?s go|go)\b/i],
  ["hello", /\b(hello|hi|hey)\b/i],
];
const SKILL = "science.mars.red_color";
const SHARE = "math.division.equal_share";

/**
 * Options whose keywords start a WORD in the text ("rusty" matches rust; "photo" does not match hot).
 * A keyword starting with "=" must match a whole word exactly ("=4" matches "4" but not "14" or "40").
 */
export function matchOptions(text: string, q: Question) {
  const words: string[] = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  return q.options.filter((o) => o.keywords.some((k) => k.startsWith("=") ? words.includes(k.slice(1)) : words.some((w) => w.startsWith(k))));
}

/** Every question in every world, by id (ids are unique across worlds; see tests/brain.test.ts). */
const QUESTIONS: ReadonlyMap<string, Question> = new Map<string, Question>(Object.values(WORLDS).flatMap((w) => Object.values(w.questions).map((q): [string, Question] => [q.id, q])));
/** Classroom no-hint checks, one per trip skill. */
const RECALL: Record<string, string> = { "science.mars.red_color": "q_red_recall", "math.division.equal_share": "q_share_recall" };

export class ScriptedBrain implements Brain {
  readonly kind = "scripted" as const;
  private pending: { q: Question; hints: number } | null = null;
  private sawRock = false;
  private sawCrate = false;
  /** The world we last came back from, for the classroom recheck. */
  private lastTrip: string | null = null;
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
      case "widget": return this.widget(input.value, input.target, ctx);
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
    const share = skillStatus(ctx.profile.attempts, SHARE);
    if (ctx.profile.sessions > 1 && status.kind !== "needs_check" && share.kind === "needs_check") {
      this.recallContext = "later_check";
      this.pending = { q: WORLDS.classroom.questions.q_share_recall, hints: 0 };
      return { segments: [
        S("Welcome back! Last time at the market you shared oranges equally.", A("gesture", { gesture: "wave" })),
        S("Let's see if it stuck. No hints this time.", A("askQuestion", { questionId: "q_share_recall" })),
      ] };
    }
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
      S("What are we learning today?", choices(["mars", "Mars (science)"], ["market", "Sharing equally (math)"], ["fractions", "Fraction bars"])),
    ] };
  }

  private intent(intent: string, raw: string, ctx: BrainContext): BrainReply {
    const onMars = ctx.world === "mars";
    switch (intent) {
      case "stop":
        return { segments: [S("Okay. I'm listening.", A("gesture", { gesture: "nod" }))] };
      case "hello":
        return { segments: [S(`Hi! I'm ${ctx.teacherName}.`, A("gesture", { gesture: "wave" })), this.nudge(ctx)] };
      case "numberline":
        if (ctx.world === "transit") break;
        this.pending = null;
        return { segments: [
          S("Here's a number line from zero to one. It's cut into four equal steps.", A("gesture", { gesture: "open_hands" }),
            A("showWidget", { widget: "number_line", min: 0, max: 1, step: 0.25, format: "fraction", denominator: 4, marks: [], target: 0.75 })),
          S("Tap where three quarters is, then tell me."),
        ] };
      case "fractions":
        if (ctx.world === "transit") break;
        this.pending = null;
        return { segments: [
          S("Let's use fraction bars. The top bar is cut into four equal parts, and the bottom one shows one half.", A("gesture", { gesture: "open_hands" }),
            A("showWidget", { widget: "fraction_bars", bars: [{ parts: 4, shaded: 0 }, { parts: 2, shaded: 1 }], target_num: 1, target_den: 2 })),
          S("Tap parts of the top bar to shade the same amount as the bottom bar, then tell me."),
        ] };
      case "market":
        if (ctx.world === "market") { this.pending = null; return this.inviteCrate(); }
        if (ctx.world === "classroom")
          return { segments: [
            S("Sharing! Let's go to the market and share some oranges.", A("moveTeacherTo", { spot: "center" }), A("gesture", { gesture: "open_hands" })),
            S("Here we go!", A("openWorld", { world: "market" })),
          ] };
        return { segments: [S("Hold on, we're on our way!")] };
      case "mars":
      case "yes":
        if (ctx.world === "market" && intent === "yes") { this.pending = null; return this.inviteCrate(); }
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
        if (ctx.world === "market") {
          this.pending = null;
          return { segments: [S("Time to head back to class. Let's go!", A("gesture", { gesture: "wave" }), A("openWorld", { world: "classroom" }))] };
        }
        if (!onMars) return { segments: [S("We're already in the classroom."), this.nudge(ctx)] };
        this.pending = null;
        return { segments: [S("Time to head back to class. Hold on!", A("gesture", { gesture: "wave" }), A("openWorld", { world: "classroom" }))] };
    }
    // Honest fallback: say what this demo can do instead of bluffing.
    void raw;
    return { segments: [
      S("Good question! In this early version my lesson is scripted, so I can only take you to Mars or the sharing market for now.", A("gesture", { gesture: "shrug" })),
      this.nudge(ctx),
    ] };
  }

  private widget(value: string, target: string | undefined, ctx: BrainContext): BrainReply {
    const m = matches(value, target);
    if (m === true)
      return { segments: [
        S("Yes, that's it! You got it by looking carefully.", A("gesture", { gesture: "thumbs_up" })),
        S("What next?", choices(["fractions", "Fraction bars"], ["numberline", "Number line"], ["mars", "Go to Mars"])),
      ] };
    if (m === false)
      return { segments: [S("Not quite. Count the equal parts again, and try another spot.", A("gesture", { gesture: "think" }))] };
    return { segments: [S("Nice! Take your time, and tell me when you're ready."), this.nudge(ctx)] };
  }

  private nudge(ctx: BrainContext): Segment {
    if (ctx.world === "market")
      return this.sawCrate
        ? S("Want to share again, or head back?", choices(["market", "Share again"], ["back", "Back to class"]))
        : S("Shall we share the oranges?", choices(["market", "Yes, share them!"], ["back", "Back to class"]));
    if (ctx.world === "mars")
      return this.sawRock
        ? S("Want to explore more?", choices(["crater", "The crater"], ["mountain", "The volcano"], ["back", "Back to class"]))
        : S("What do you notice?", choices(["red", "Why is everything red?"], ["air", "Where are the people?"], ["crater", "What's that big hole?"]));
    return S("Where shall we go?", choices(["mars", "Mars (science)"], ["market", "Sharing equally (math)"]));
  }

  private inviteCrate(): BrainReply {
    return { segments: [
      S("This crate has 12 oranges, and we have 3 baskets.", A("moveTeacherTo", { spot: "stall_side" }), A("pointAt", { target: "crate" })),
      S("Let's share them fairly. Tap the crate to start.", A("inviteTap", { target: "crate" })),
    ] };
  }

  private inviteRock(): BrainReply {
    return { segments: [
      S("Let's be scientists and find out. See this rock?", A("moveTeacherTo", { spot: "rock_side" }), A("pointAt", { target: "rock_1" })),
      S("Tap it so we can look closer.", A("inviteTap", { target: "rock_1" })),
    ] };
  }

  private arrived(world: string, ctx: BrainContext): BrainReply {
    if (world === "mars") {
      this.lastTrip = "mars";
      return { segments: [
        S("We made it! This is a pretend trip. Real astronauts need spacesuits, because there's almost no air on Mars.", A("gesture", { gesture: "open_hands" })),
        S("Look around. What do you notice?", choices(["red", "Everything is red!"], ["air", "Where are the people?"], ["crater", "What's that big hole?"])),
      ] };
    }
    if (world === "market") {
      this.lastTrip = "market";
      return { segments: [
        S("Welcome to the Fair Share Market! This is a pretend market for practice.", A("gesture", { gesture: "open_hands" })),
        S("We have oranges to share. Ready?", choices(["market", "Let's share!"], ["back", "Back to class"])),
      ] };
    }
    // Back in the classroom after a trip: unassisted check on a different question, for the trip we just did.
    const fromMarket = this.lastTrip === "market";
    this.lastTrip = null;
    const skill = fromMarket ? SHARE : SKILL;
    const saw = fromMarket ? this.sawCrate : this.sawRock;
    const asked = saw && skillStatus(ctx.profile.attempts, skill).kind === "needs_check";
    const qid = RECALL[skill];
    if (asked) {
      this.recallContext = "recheck";
      this.pending = { q: WORLDS.classroom.questions[qid], hints: 0 };
      return { segments: [S("Welcome back to class!", A("gesture", { gesture: "wave" })), S("Quick check, no hints this time.", A("askQuestion", { questionId: qid }))] };
    }
    return { segments: [S("Welcome back to class!", A("gesture", { gesture: "wave" })), S("Where next?", choices(["mars", "Mars (science)"], ["market", "Sharing equally (math)"]))] };
  }

  private tap(target: string, ctx: BrainContext): BrainReply {
    if (target === "crate" && ctx.world === "market") {
      this.sawCrate = true;
      this.pending = { q: WORLDS.market.questions.q_share, hints: this.hintsGiven.q_share ?? 0 };
      return { segments: [
        S("Watch! One orange in each basket, then again, round and round.", A("moveTeacherTo", { spot: "basket_side" }), A("pointAt", { target: "basket_1" })),
        S("Now every basket has the same number. That's sharing equally.", A("gesture", { gesture: "open_hands" })),
        S("12 oranges shared equally into 3 baskets. How many in each basket?", A("askQuestion", { questionId: "q_share" })),
      ] };
    }
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
    const q = QUESTIONS.get(questionId);
    const opt = q?.options.find((o) => o.id === optionId);
    if (!q || !opt) return { segments: [S("Hmm, I didn't catch that answer.")] };
    // Only the open question can be answered (no double-recording from a stale card).
    if (!this.pending || this.pending.q.id !== questionId)
      return { segments: [S("That question is finished. Let's keep going!"), this.nudge(ctx)] };
    const later = questionId === "q_red_recall" || questionId === "q_share_recall";
    const isShare = q.skill === SHARE;
    if (later) {
      this.pending = null;
      ctx.record({ skill: q.skill, questionId, answerId: optionId, correct: opt.correct, hintsUsed: 0, context: this.recallContext });
      const praise = this.recallContext === "later_check" ? "And you remembered it from last time, all by yourself." : "No hints needed. We'll check again another day.";
      const again: [string, string] = isShare ? ["market", "Back to the market"] : ["mars", "Go to Mars"];
      return opt.correct
        ? { segments: [S(`Yes! ${isShare ? "5 on each plate." : "Iron that rusted."} ${praise}`, A("gesture", { gesture: "thumbs_up" })), S("Where next?", choices(again, isShare ? ["mars", "Mars (science)"] : ["market", "Sharing equally (math)"]))] }
        : { segments: [S(`Not quite. ${q.explain}`, A("gesture", { gesture: "open_hands" })), S("We'll check it again another day. Want to practise more?", choices(again))] };
    }
    const p = this.pending && this.pending.q.id === questionId ? this.pending : { q, hints: 0 };
    if (opt.correct) {
      this.pending = null;
      ctx.record({ skill: q.skill, questionId, answerId: optionId, correct: true, hintsUsed: p.hints, context: "taught" });
      if (isShare)
        return { segments: [
          S(p.hints ? "Yes, that's it! 4 in each basket." : "Yes! 4 in each basket. You figured that out yourself.", A("gesture", { gesture: "thumbs_up" })),
          S("That's division: 12 divided by 3 is 4. And 3 groups of 4 make 12 again.", A("gesture", { gesture: "open_hands" })),
          S("What next?", choices(["back", "Back to class"], ["fractions", "Fraction bars"])),
        ] };
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
    if (isShare)
      return { segments: [
        S(`That's okay, this one is tricky. ${q.explain}`, A("pointAt", { target: "basket_1" })),
        S("What next?", choices(["back", "Back to class"], ["market", "Share again"])),
      ] };
    return { segments: [
      S(`That's okay, this one is tricky. ${q.explain}`, A("pointAt", { target: "rock_1" })),
      S("Let's keep exploring.", choices(["crater", "The crater"], ["mountain", "The giant volcano"])),
    ] };
  }
}
