import { describe, expect, it, vi } from "vitest";
import { cleanReply, extractActs, extractScene, handleTaste, makeTasteDeps, type TasteDeps } from "@/lib/taste/server/handler";
import { RateLimiter } from "@/lib/brain/server/limits";
import { parseFrame } from "@/lib/scene/frame";
import { FIGURES } from "@/lib/assets/figures";
import { ASSETS, MAX_SCENE_KB, checkAssets } from "@/lib/assets/manifest";

vi.mock("server-only", () => ({}));

/** Tester sweep of hostile ACT / CHOICES / BOARD / SCENE lines from the (mocked) model. */
const KEY = "test-key-not-real-0000";
const reply = (text: string) => vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text }], usage: { input_tokens: 4, output_tokens: 3 } }), { status: 200 }));
const deps = (f: ReturnType<typeof reply>): TasteDeps =>
  makeTasteDeps({ env: { apiKey: KEY, disabled: false, perIpDaily: 60, globalDaily: 600 }, fetchImpl: f as unknown as typeof fetch, now: () => Date.UTC(2026, 10, 21), log: () => {}, ipLimiter: new RateLimiter(1000, 60_000) });
const call = async (text: string) => {
  const r = await handleTaste(new Request("https://g.test/api/taste", { method: "POST", headers: { "content-type": "application/json", host: "g.test", "x-forwarded-for": "198.51.100.1" }, body: JSON.stringify({ v: 1, tasteId: "sweep_0001_" + Math.random().toString(36).slice(2, 8), text: "why?", history: [] }) }), deps(reply(text)));
  return { status: r.status, j: (await r.json()) as Record<string, unknown> };
};
const blocks = (t: string) => [{ type: "text", text: t }];

describe("hostile lines from the model reach no surface", () => {
  it("10 KB lines: a huge CHOICES / ACT / BOARD / TOPIC / SCENE line yields none of them, and the reply stays capped", async () => {
    const big = "z".repeat(10_240);
    for (const line of [`CHOICES: ${big} | b`, `ACT: ${big}`, `BOARD: ${big}`, `TOPIC: ${big}`, `SCENE: {"setting":"desert","era":"${big}","props":[]}`]) {
      const { status, j } = await call(`Fine answer.\n${line}`);
      expect(status).toBe(200);
      expect(j.choices ?? j.act ?? j.board ?? j.topic ?? j.scene).toBeUndefined();
      expect(String(j.reply).length).toBeLessThanOrEqual(280);
      expect(String(j.reply)).not.toContain("zzzz");
    }
  });
  it("valid-looking lines hidden after 2 KB of padding are ignored (the whole block is skipped)", () => {
    const o = extractActs(blocks("p".repeat(2500) + "\nACT: jump\nCHOICES: a | b\nBOARD: Hi\nGESTURE: wave\nTOPIC: frogs"));
    expect(o).toEqual({});
  });
  it("first valid line wins; later or repeated lines cannot replace it", () => {
    const o = extractActs([{ type: "text", text: "Hi.\nACT: jump\nACT: clap\nCHOICES: a | b\nCHOICES: c | d" }, { type: "text", text: "ACT: run\nCHOICES: x | y" }]);
    expect(o.act).toBe("jump"); expect(o.choices).toEqual(["a", "b"]);
  });
  it("markup, links, handles, control and bidi characters, zero-width tricks, every proto-ish id", () => {
    for (const a of ["__proto__", "constructor", "toString", "hasOwnProperty", "prototype", "ju​mp", "jump‮", " jump", "jump ", "jump\r", "JUMP", "swim", "climb", "<script>", "../jump", "jump|clap", "jump,clap"]) {
      const x = extractActs(blocks(`Ok.\nACT: ${a}`)).act;
      expect(["jump"]).toContain(x ?? "jump");
      if (a !== "jump") expect(x === undefined || x === "jump").toBe(true);
    }
    for (const c of ["<img src=x onerror=1> | b", "a | b‮", "a​ | b", "[a](http://e.x) | b", "a | `b`", "a | b\\", "a | __proto__ ", "a | ", "http://x | b", "a | b | ", "javascript:1 | b", "ａ | ｂ <"]) {
      const ch = extractActs(blocks(`Q?\nCHOICES: ${c}`)).choices;
      if (ch) for (const x of ch) expect(x).toMatch(/^[^<>{}\[\]\\|`@]+$/);
    }
    for (const b of ["<b>x</b>", "{{x}}", "[x](y)", "x‮y", "call 5550142", "a@b.co", "go to x.com"]) expect(extractActs(blocks(`Ok.\nBOARD: ${b}`)).board).toBeUndefined();
  });
  it("markers on the SAME line as speech do not become a surface; report if they are spoken aloud", async () => {
    const { j } = await call("Nice one! ACT: jump CHOICES: a | b");
    expect(j.act).toBeUndefined(); expect(j.choices).toBeUndefined();
    // "ACT:" mid-line is treated as speech by design (see tasteArc). Documented, not asserted either way beyond not crashing.
    expect(typeof j.reply).toBe("string");
  });
  it("a model reply with NO marker lines still answers (no act, choices, board, topic, scene) and the status is 200", async () => {
    const { status, j } = await call("Plants make food from sunlight, water and air.");
    expect(status).toBe(200);
    expect(Object.keys(j).sort()).toEqual(["reply", "turnsLeft"]);
  });
  it("only marker lines and no spoken sentence: a clean 502, never a blank bubble", async () => {
    const { status } = await call("ACT: jump\nCHOICES: a | b\nTOPIC: frogs");
    expect(status).toBe(502);
  });
  it("SCENE: lookalike prop ids, mixed looks, duplicates, 7 props, __proto__ keys are refused or trimmed", () => {
    const sc = (props: unknown, extra: Record<string, unknown> = {}) => extractScene(blocks(`Ok.\nSCENE: ${JSON.stringify({ setting: "desert", era: "Egypt", props, ...extra })}`));
    for (const p of [["PR_PYRAMIDS"], ["pr_pyramids "], ["pr_pyramids/../x"], ["pr_pyramid"], ["pr_"], ["__proto__"], ["constructor"], [["pr_pyramids"]], [1], ["pr_pyramids", "pr_pyramids", "pr_palms", "pr_palms", "pr_pyramids", "pr_palms", "pr_pyramids"]]) {
      const s = sc(p);
      if (s) expect((s.props as string[]).every((x) => ["pr_pyramids", "pr_palms"].includes(x))).toBe(true);
    }
    expect(sc(["pr_pyramids", "pr_palms"])?.props).toEqual(["pr_pyramids", "pr_palms"]);
    expect(extractScene(blocks('SCENE: {"setting":"__proto__","era":"x","props":[]}'))).toBeUndefined();
    expect(extractScene(blocks('SCENE: {"__proto__":{"setting":"desert"},"era":"x"}'))).toBeUndefined();
  });
  it("swim/climb never survive end to end", async () => {
    for (const a of ["swim", "climb"]) { const { j } = await call(`Splash.\nACT: ${a}\nBOARD: Water`); expect(j.act).toBeUndefined(); expect(j.board).toBe("Water"); }
  });
  it("cleanReply never speaks a marker line, even with fullwidth colon or odd case", () => {
    for (const l of ["BOARD: Hi", "board: hi", "BOARD： hi", "CHOICES: a | b", "choices: a | b", "TOPIC: x", "GESTURE: wave", "SCENE: {}", "ACT: jump", "  ACT: jump", "act: jump"]) {
      const out = cleanReply(blocks(`Plants need light.\n${l}`)) ?? "";
      expect(out).toBe("Plants need light.");
    }
  });
});

describe("pr_pyramids / pr_palms in a story scene with an unrelated figure", () => {
  const withFigures = FIGURES.filter((f) => f.model);
  it("each pr_ prop adds nothing to the download budget (kb 0): the scene fits whenever the figure alone fits", () => {
    for (const f of withFigures) {
      const alone = parseFrame({ setting: "desert", era: "x", props: [], figure: f.id });
      const withPr = parseFrame({ setting: "desert", era: "x", props: ["pr_pyramids", "pr_palms"], figure: f.id });
      expect(withPr.ok).toBe(alone.ok);
    }
  });
  it("a figure plus the largest realistic and stylised props plus pr_ props: same verdict as without the pr_ props, and a mixed look is still refused", () => {
    const real = ASSETS.filter((a) => a.look === "realistic").sort((a, b) => b.kb - a.kb);
    const styl = ASSETS.filter((a) => a.look === "stylized").sort((a, b) => b.kb - a.kb);
    for (const group of [real, styl]) {
      const ids = group.slice(0, 3).map((a) => a.id);
      for (const f of withFigures.slice(0, 5)) {
        const a = parseFrame({ setting: "desert", era: "x", props: ids, figure: f.id });
        const b = parseFrame({ setting: "desert", era: "x", props: [...ids, "pr_pyramids", "pr_palms"], figure: f.id });
        expect(b.ok).toBe(a.ok);
      }
    }
    expect(checkAssets([real[0].id, styl[0].id, "pr_pyramids"])).toBe("mixed looks");
    expect(MAX_SCENE_KB).toBeGreaterThan(0);
  });
});
