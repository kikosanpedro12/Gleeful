import { describe, expect, it } from "vitest";
import { buildReply } from "@/lib/brain/server/sanitize";
import { parseFrame, MAX_PROPS } from "@/lib/scene/frame";
import { parseSceneCommand, toolsFor } from "@/lib/scene/commands";
import { contextFor } from "@/lib/worlds/registry";

const text = (t: string) => ({ type: "text", text: t });
const tool = (name: string, input: unknown) => ({ type: "tool_use", id: "t", name, input });
const good = { setting: "study", era: "France, about 1805", props: ["ph_pocket_watch", "ph_marble_bust_01"] };
const inp = { kind: "text", text: "tell me about Napoleon" } as never;
const names = (r: ReturnType<typeof buildReply>) => (r?.segments ?? []).flatMap((s) => (s.actions ?? []).map((a) => a.name));

describe("showScene through buildReply (server side)", () => {
  it("keeps a valid scene and only the validated fields", () => {
    const r = buildReply([text("Let me show you."), tool("showScene", { ...good, x: 1, url: "http://e.x", html: "<b>" })], "classroom", inp)!;
    const a = r.segments.flatMap((s) => s.actions ?? []).find((x) => x.name === "showScene")!;
    expect(a.args).toEqual({ setting: "study", era: "France, about 1805", props: ["ph_pocket_watch", "ph_marble_bust_01"] });
  });
  it("two scenes in one reply: only the first survives", () => {
    const r = buildReply([text("a"), tool("showScene", good), tool("showScene", { ...good, era: "Rome" })], "classroom", inp);
    expect(names(r).filter((n) => n === "showScene")).toHaveLength(1);
  });
  it("drops hostile scenes", () => {
    for (const bad of [{ ...good, setting: "__proto__" }, { ...good, props: ["https://evil.example/a.glb"] }, { ...good, props: ["nope"] },
      { ...good, props: Array(MAX_PROPS + 1).fill("ph_pocket_watch") }, { ...good, figure: "napoleon" }, { ...good, era: 5 }, "str", null, []]) {
      const r = buildReply([text("hi"), tool("showScene", bad)], "classroom", inp);
      expect(names(r)).not.toContain("showScene");
    }
  });
  it("links and emails in the era caption are stripped, never shown", () => {
    for (const era of ["visit http://evil.example now", "mail me a@b.co", "go to bit.ly/abc", "evil.example/x"]) {
      const r = buildReply([text("hi"), tool("showScene", { ...good, era })], "classroom", inp)!;
      const a = r.segments.flatMap((s) => s.actions ?? []).find((x) => x.name === "showScene");
      expect(String(a?.args.era ?? "")).not.toMatch(/http|@|\.(co|ly|example)|\//i);
    }
  });
  it("drops showScene while travelling and unknown tool names", () => {
    expect(names(buildReply([text("hi"), tool("showScene", good)], "transit", inp))).not.toContain("showScene");
    expect(names(buildReply([text("hi"), tool("showScene", good), tool("showSceneX", good)], "classroom", inp))).not.toContain("showSceneX");
  });
  it("era is capped and control characters removed", () => {
    const f = parseFrame({ ...good, era: "A\u0000‮B " + "x".repeat(200) });
    expect(f.ok && f.frame.era.length).toBeLessThanOrEqual(60);
    expect(f.ok && /[\u0000‮]/.test(f.frame.era)).toBe(false);
  });
  it("hideScene is accepted with no args; tools advertise both only outside transit", () => {
    expect(parseSceneCommand("hideScene", {}, contextFor("classroom")).ok).toBe(true);
    const n = (w: "classroom" | "transit") => toolsFor(contextFor(w)).map((t: { name: string }) => t.name);
    expect(n("classroom")).toEqual(expect.arrayContaining(["showScene", "hideScene"]));
    expect(n("transit")).not.toContain("showScene");
  });
  it("the tool schema never offers a figure while the manifest is empty", () => {
    const t = toolsFor(contextFor("classroom")).find((x: { name: string }) => x.name === "showScene") as { input_schema: { properties: Record<string, unknown> } };
    expect(t.input_schema.properties.figure).toBeUndefined();
  });
});
