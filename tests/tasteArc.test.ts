import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { handleTaste, makeTasteDeps, extractActs, type TasteDeps } from "@/lib/taste/server/handler";
import { TASTE_SYSTEM, tasteSystem, buildTasteUser, TASTE_ACTIONS } from "@/lib/taste/server/prompt";
import { RateLimiter } from "@/lib/brain/server/limits";
import { choicesOk, topicOk } from "@/lib/taste/boardText";
import { paywallCopy, tapChips } from "@/components/landing/tasteCopy";
import { parseFrame } from "@/lib/scene/frame";
import { assetById, checkAssets, isProcedural, PROCEDURAL_PROPS } from "@/lib/assets/manifest";
import { SAFETY_CASES, judge } from "@/lib/safety/cases";

/**
 * The landing taste as a guided 3-try arc: answer, show (SCENE/BOARD/ACT), ask back with 2 tap answers (CHOICES),
 * react, tease, paywall that names the topic. Topic-agnostic. Also: the teacher-name prompt fix, ACT, pyramid props.
 */
const KEY = "test-key-not-real-0000";
const NOW = Date.UTC(2026, 10, 21, 12, 0, 0);
const body = (over: Record<string, unknown> = {}) => ({ v: 1, tasteId: "taste_arc_0001", text: "why?", history: [], ...over });
const http = (b: unknown, ip = "203.0.113.9") =>
  new Request("https://gleeful.test/api/taste", { method: "POST", headers: { "content-type": "application/json", host: "gleeful.test", "x-forwarded-for": ip }, body: JSON.stringify(b) });
const reply = (text: string) => vi.fn(async (_u: unknown, _i?: unknown) => new Response(JSON.stringify({ content: [{ type: "text", text }], usage: { input_tokens: 4, output_tokens: 3 } }), { status: 200 }));
const deps = (f: ReturnType<typeof reply>, over: Partial<TasteDeps> = {}): TasteDeps =>
  makeTasteDeps({ env: { apiKey: KEY, disabled: false, perIpDaily: 60, globalDaily: 600 }, fetchImpl: f as unknown as typeof fetch, now: () => NOW, log: () => {}, ipLimiter: new RateLimiter(1000, 60_000), ...over });
const json = async (r: Response) => (await r.json()) as Record<string, unknown>;
const userOf = (f: ReturnType<typeof reply>) => JSON.parse(((f.mock.calls[0] as unknown) as [string, { body: string }])[1].body).messages[0].content as string;
const blocks = (t: string) => [{ type: "text", text: t }];

describe("taste prompt: the named cartoon tutor, AI only when asked", () => {
  it("names the teacher in the SYSTEM prompt and plays the character", () => {
    expect(tasteSystem("leo")).toMatch(/^You are Leo, a friendly cartoon tutor character/);
    expect(tasteSystem("mia")).toMatch(/^You are Mia, a friendly cartoon tutor character/);
    expect(tasteSystem("leo")).toMatch(/never question it or comment on it/);
    expect(tasteSystem("leo")).not.toMatch(/You are the AI tutor of Gleeful/);
  });
  it("says it is an AI only if asked and never volunteers odd disclaimers", () => {
    expect(TASTE_SYSTEM).toMatch(/AI, never a human/);
    expect(TASTE_SYSTEM).toMatch(/Only if someone asks whether you are real, a person, a human, a robot or an AI, say kindly that you are an AI tutor/);
    expect(TASTE_SYSTEM).toMatch(/never volunteer disclaimers/);
  });
  it("the safety case 'are you a real person' still requires an AI answer, and the in-character answer passes", () => {
    const human = SAFETY_CASES.find((c) => c.id === "human")!;
    expect(judge(human, "I'm Leo, and I'm an AI tutor, not a person! Want to explore something?").ok).toBe(true);
    expect(judge(human, "I'm Leo! What shall we learn?").ok).toBe(false);
  });
  it("safety rules come before the lesson shape, and the user turn never carries the name", () => {
    const s = tasteSystem("mia");
    expect(s.indexOf("Never ask for or accept personal information")).toBeLessThan(s.indexOf("How you teach"));
    expect(s).toMatch(/safety rules always win/);
    expect(buildTasteUser({ v: 1, tasteId: "x".repeat(8), text: "hi", teacher: "mia", history: [] })).not.toMatch(/Mia/);
  });
  it("tells the model to leave props out rather than pick an unrelated one, and lists the pyramid prop", () => {
    expect(TASTE_SYSTEM).toMatch(/leave props empty \(\[\]\) rather than pick an unrelated one/);
    expect(TASTE_SYSTEM).toContain("pr_pyramids");
    const brain = fs.readFileSync("src/lib/brain/server/prompt.ts", "utf8");
    expect(brain).toMatch(/leave props out \(an empty list\) rather than pick one that does not fit/);
    expect(brain).toContain("pr_pyramids");
  });
});

describe("taste prompt: a topic-agnostic initiative arc with curiosity hooks only", () => {
  it("describes the arc generically (any subject), not one topic", () => {
    expect(TASTE_SYSTEM).toMatch(/any subject/);
    expect(TASTE_SYSTEM).toMatch(/short, vivid answer/);
    expect(TASTE_SYSTEM).toMatch(/exactly 2 answers they can tap/);
    expect(TASTE_SYSTEM).toMatch(/react warmly first/);
    expect(TASTE_SYSTEM).toMatch(/tease in one sentence what a full lesson/);
    expect(TASTE_SYSTEM).not.toMatch(/Giza|Egypt(?!\))/); // pr_pyramids' description may say "pyramids of Egypt" as a prop hint
  });
  it("forbids pressure, guilt, urgency, streaks and talk of paying", () => {
    expect(TASTE_SYSTEM).toMatch(/Never pressure, guilt, fake urgency, streaks/);
    expect(TASTE_SYSTEM).toMatch(/never mention prices, trials or sign-ups/);
    expect(fs.readFileSync("src/lib/brain/server/prompt.ts", "utf8")).toMatch(/never pressure, guilt, fake urgency, streaks, or anything about paying/);
  });
  it("the server, not the browser, tells the model which try it is", async () => {
    const d = deps(reply("Fine."));
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const f = reply("Fine answer.");
      d.fetchImpl = f as unknown as typeof fetch;
      await handleTaste(http(body({ turn: 3 })), d); // a forged "turn" field is ignored
      seen.push(userOf(f));
    }
    expect(seen[0]).toMatch(/^This is question 1 of 3\./);
    expect(seen[1]).toMatch(/^This is question 2 of 3\./);
    expect(seen[2]).toMatch(/^This is question 3 of 3, the LAST one/);
  });
});

describe("taste ACT line", () => {
  it("accepts an action the classroom allows and strips the line from speech", async () => {
    const j = await json(await handleTaste(http(body()), deps(reply("Gravity pulls you back down.\nACT: jump\nBOARD: Gravity"))));
    expect(j.reply).toBe("Gravity pulls you back down.");
    expect(j.act).toBe("jump");
    expect(TASTE_ACTIONS).toEqual(["run", "jump", "eat", "sit", "clap"]);
  });
  it("drops actions the classroom does not allow (swim, climb) and hostile ids", () => {
    for (const a of ["swim", "climb", "fly", "__proto__", "constructor", "jump; rm", "https://evil.example/x.glb", "JUMP", "clap clap"]) {
      expect(extractActs(blocks(`Okay.\nACT: ${a}`)).act).toBeUndefined();
    }
  });
  it("'act:' inside a sentence is speech, not a marker; a cut-off reply carries no act", async () => {
    const j = await json(await handleTaste(http(body()), deps(reply("Let's act: like a frog, hop!"))));
    expect(j.reply).toBe("Let's act: like a frog, hop!");
    expect(j.act).toBeUndefined();
    expect(extractActs(blocks("Okay.\nACT: jump"), true).act).toBeUndefined();
  });
});

describe("taste CHOICES and TOPIC lines", () => {
  it("valid: exactly 2 short plain answers and a topic, both stripped from speech", async () => {
    const j = await json(await handleTaste(http(body()), deps(reply("12 shared by 3 is 4 each. How many if we share 12 by 4?\nBOARD: 12 ÷ 3 = 4\nCHOICES: 3 each | 4 each\nTOPIC: dividing by 3"))));
    expect(j.reply).toBe("12 shared by 3 is 4 each. How many if we share 12 by 4?");
    expect(j.choices).toEqual(["3 each", "4 each"]);
    expect(j.topic).toBe("dividing by 3");
  });
  it("too many, blank, duplicate or over-long: no choices at all (never a partial set)", () => {
    for (const c of ["A | B | C", "A |", " | B", "Yes | yes", "x".repeat(40) + " | B", "A || B"]) {
      expect(extractActs(blocks(`Q?\nCHOICES: ${c}`)).choices).toBeUndefined();
    }
  });
  it("hostile: links, markup, handles, phone numbers, unsafe words, JSON", () => {
    for (const c of ["visit bit.ly/x | ok", "<b>yes</b> | no", "@me | no", "call 5550142 | no", "fuck | no", '{"a":1} | no', "www.games.com | no", "javascript:alert(1) | no"]) {
      expect(extractActs(blocks(`Q?\nCHOICES: ${c}`)).choices).toBeUndefined();
    }
    for (const t of ["see https://x.io", "<i>frogs</i>", "a".repeat(40), "frogs @home"]) expect(extractActs(blocks(`Q?\nTOPIC: ${t}`)).topic).toBeUndefined();
  });
  it("the last try ends with a tease: choices are dropped in code even if the model sends them", async () => {
    const d = deps(reply("x"));
    let last: Record<string, unknown> = {};
    for (let i = 0; i < 3; i++) {
      d.fetchImpl = reply("Right! In a full lesson we'd watch a tadpole grow legs.\nCHOICES: Yes | No\nTOPIC: how frogs grow") as unknown as typeof fetch;
      last = await json(await handleTaste(http(body({ tasteId: "taste_arc_last" })), d));
    }
    expect(last.turnsLeft).toBe(0);
    expect(last.choices).toBeUndefined();
    expect(last.topic).toBe("how frogs grow");
  });
  it("a moderated (redirected) reply carries no choices or topic", async () => {
    const j = await json(await handleTaste(http(body()), deps(reply("Here: fuck.\nCHOICES: A | B\nTOPIC: bad"))));
    expect(j.choices).toBeUndefined(); expect(j.topic).toBeUndefined();
  });
  it("browser re-check agrees: choicesOk / topicOk", () => {
    expect(choicesOk(["Rust", "Paint"])).toBe(true);
    expect(choicesOk(["Only one"])).toBe(true);
    expect(choicesOk(["a", "b", "c"])).toBe(false);
    expect(choicesOk(["<b>x</b>", "y"])).toBe(false);
    expect(choicesOk("Rust | Paint")).toBe(false);
    expect(choicesOk([{ toString: () => "x" }, "y"])).toBe(false);
    expect(choicesOk([" padded", "y"])).toBe(false);
    expect(topicOk("how frogs grow")).toBe(true);
    expect(topicOk("go to www.x.com")).toBe(false);
  });
});

describe("three different topics all get the same arc (not tuned to one subject)", () => {
  const topics = [
    { q: "What is 12 divided by 3?", r: "12 split into 3 equal groups is 4 in each.\nBOARD: 12 ÷ 3 = 4\nCHOICES: 3 | 4\nTOPIC: dividing by 3", topic: "dividing by 3", choices: ["3", "4"] },
    { q: "How do frogs grow?", r: "Frogs start as eggs, then tadpoles that grow legs!\nACT: jump\nBOARD: egg, tadpole, frog\nCHOICES: Legs first | Tail first\nTOPIC: how frogs grow", topic: "how frogs grow", choices: ["Legs first", "Tail first"], act: "jump" },
    { q: "Who was Jose Rizal?", r: "Jose Rizal was a Filipino writer whose books helped people dream of freedom.\nBOARD: Jose Rizal\nCHOICES: Writer | Sailor\nTOPIC: Jose Rizal", topic: "Jose Rizal", choices: ["Writer", "Sailor"] },
  ];
  for (const t of topics) {
    it(`${t.topic}: answer, show, ask back with 2 choices, topic for the paywall`, async () => {
      const j = await json(await handleTaste(http(body({ text: t.q, tasteId: `taste_${t.topic.replace(/\W/g, "_")}` })), deps(reply(t.r))));
      expect(j.reply).not.toMatch(/CHOICES|TOPIC|BOARD|ACT:/);
      expect(j.choices).toEqual(t.choices);
      expect(j.topic).toBe(t.topic);
      expect(j.board).toBeTruthy();
      if (t.act) expect(j.act).toBe(t.act);
      expect(paywallCopy("Leo", j.topic).heading).toContain(t.topic);
    });
  }
});

describe("taste UI helpers: chips and paywall", () => {
  const ideas = ["Why is Mars red?", "How did Rizal live?"];
  it("starter chips only before the first question; then the tutor's 2 answers replace them; never the starters again", () => {
    expect(tapChips({ used: 0, asked: 0, choices: [], ideas })).toEqual({ kind: "ideas", items: ideas });
    expect(tapChips({ used: 1, asked: 2, choices: ["Rust", "Paint"], ideas })).toEqual({ kind: "choices", items: ["Rust", "Paint"] });
    expect(tapChips({ used: 1, asked: 2, choices: [], ideas })).toEqual({ kind: "none", items: [] });
    expect(tapChips({ used: 1, asked: 0, choices: undefined, ideas }).kind).toBe("none"); // came back after a refresh with a try used
    expect(tapChips({ used: 1, asked: 2, choices: ["<x>", "y"], ideas }).kind).toBe("none");
  });
  it("paywall speaks to the grown-up, names the topic, and never pushes", () => {
    const p = paywallCopy("Mia", "how frogs grow");
    expect(p.heading).toBe("That was how frogs grow, with Mia.");
    expect(p.body).toContain("how frogs grow");
    const all = p.heading + p.body;
    expect(all).not.toMatch(/hurry|last chance|only today|don't miss|streak|now or never|limited/i);
    expect(paywallCopy("Leo", "<script>").heading).not.toContain("<script>");
    const src = fs.readFileSync("src/components/landing/ClassroomHero.tsx", "utf8");
    expect(src).toMatch(/For grown-ups/);
    expect(src).toMatch(/Payments are not switched on yet/);
    expect(src).toMatch(/href="\/sign-in" data-testid="start-trial"/);
  });
});

describe("mic in the taste", () => {
  it("is shown only when the browser has speech recognition, and carries the honest disclosure", async () => {
    const { recognitionAvailable } = await import("@/lib/voice/speech");
    expect(recognitionAvailable()).toBe(false); // node: no SpeechRecognition
    const src = fs.readFileSync("src/components/landing/ClassroomHero.tsx", "utf8");
    expect(src).toMatch(/setMic\(recognitionAvailable\(\) \? "ok" : "none"\)/);
    expect(src).toMatch(/\{mic === "ok" && \(\s*<button[^>]*lp-mic/);
    expect(src).toMatch(/mic === "ok" && used < TASTE_MAX_TURNS && <p className="lp-fine-print" data-testid="taste-mic-disclosure">Mic: your browser sends your voice to its maker \(Google, Microsoft or Apple\)/);
    // reuses the lesson's recogniser, does not build its own
    expect(src).toMatch(/import \{ listenOnce, recognitionAvailable, type Listening \} from "@\/lib\/voice\/speech"/);
    expect(src).not.toMatch(/new \(?window\.(webkit)?SpeechRecognition/);
  });
});

describe("procedural story props (drawn in code)", () => {
  it("pr_pyramids is a valid prop with either look, honest size, and a licence row", () => {
    const a = assetById("pr_pyramids")!;
    expect(a && isProcedural(a)).toBe(true);
    expect(a.kb).toBe(0);
    expect(parseFrame({ setting: "desert", era: "Egypt, long ago", props: ["pr_pyramids"] }).ok).toBe(true);
    expect(checkAssets(["pr_pyramids", "ph_wooden_crate_02"])).toBeNull();
    expect(checkAssets(["pr_pyramids", "tp_elephant"])).toBeNull();
    expect(checkAssets(["ph_wooden_crate_02", "tp_elephant"])).toBe("mixed looks"); // the old rule still holds
    const lic = fs.readFileSync("ASSET_LICENSES.md", "utf8");
    for (const p of PROCEDURAL_PROPS) expect(lic).toContain(p.id);
  });
  it("hostile and look-alike ids are rejected", () => {
    for (const id of ["pr_", "pr_pyramid", "PR_PYRAMIDS", "pr_pyramids.glb", "__proto__", "constructor", "../pr_pyramids", "https://evil.example/pr_pyramids.glb"]) {
      expect(parseFrame({ setting: "desert", era: "x", props: [id] }).ok).toBe(false);
    }
  });
});

describe("controller: the taste's ACT goes through the world's validator", () => {
  it("queues jump in the classroom, refuses swim and hostile ids", async () => {
    const { session } = await import("@/lib/session/controller");
    const { useSession } = await import("@/lib/session/store");
    session.tasteOpen("leo");
    session.tasteAsked();
    session.tasteActs({ act: "jump" });
    const d = useSession.getState().directives;
    expect(d.at(-1)?.command).toEqual({ name: "act", action: "jump" });
    expect(d.at(-1)?.turnId).toBe(useSession.getState().conv.turnId);
    const n = useSession.getState().directives.length;
    for (const bad of ["swim", "__proto__", { action: "jump" }, "https://x"]) session.tasteActs({ act: bad as unknown });
    expect(useSession.getState().directives.length).toBe(n);
    session.tasteSpeaking(true);
    expect(useSession.getState().conv.state).toBe("speaking");
    session.tasteStop();
    expect(useSession.getState().conv.state).toBe("idle");
    expect(useSession.getState().directives).toEqual([]); // Stop drops queued actions (new turn)
    session.tasteClose();
  });
  it("mouth level follows the taste voice only while no lesson provider runs", async () => {
    const { session } = await import("@/lib/session/controller");
    session.setTasteLevel(() => 0.5);
    expect(session.outputLevel()).toBe(0.5);
    session.setTasteLevel(null);
    expect(session.outputLevel()).toBe(0);
  });
});

describe("paywallCopy grammar", () => {
  it("never puts a capitalised 'Your tutor' in the middle of a sentence", () => {
    const c = paywallCopy(null, null);
    expect(c.body).toMatch(/^In a full lesson, your tutor keeps going/);
    expect(c.heading).toBe("Your tutor has so much more to show your child.");
    expect(paywallCopy("Mia", null).body).toMatch(/^In a full lesson, Mia keeps going/);
  });
});
