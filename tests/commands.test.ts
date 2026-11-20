import { describe, expect, it } from "vitest";
import { parseToolCall, parseSceneCommand, toolsFor } from "@/lib/scene/commands";
import { contextFor } from "@/lib/worlds/registry";

const room = contextFor("classroom");
const mars = contextFor("mars");
const transit = contextFor("transit");

describe("scene command validation is world-aware", () => {
  it("accepts prepared commands that exist in the current world", () => {
    expect(parseToolCall("pointAt", '{"target":"mars_globe"}', room)).toEqual({ ok: true, command: { name: "pointAt", target: "mars_globe" } });
    expect(parseToolCall("moveTeacherTo", '{"spot":"board_side"}', room).ok).toBe(true);
    expect(parseToolCall("pointAt", '{"target":"rock_1"}', mars).ok).toBe(true);
    expect(parseToolCall("inviteTap", '{"target":"rock_1"}', mars).ok).toBe(true);
    expect(parseToolCall("askQuestion", '{"questionId":"q_red"}', mars).ok).toBe(true);
    expect(parseToolCall("pointAt", '{"target":"destination"}', transit).ok).toBe(true);
  });
  it("rejects ids from another world", () => {
    expect(parseToolCall("pointAt", '{"target":"rock_1"}', room).ok).toBe(false);
    expect(parseToolCall("pointAt", '{"target":"board"}', mars).ok).toBe(false);
    expect(parseToolCall("moveTeacherTo", '{"spot":"crater_edge"}', room).ok).toBe(false);
    expect(parseToolCall("writeOnBoard", '{"text":"hi"}', mars).ok).toBe(false);
    expect(parseToolCall("askQuestion", '{"questionId":"q_red"}', room).ok).toBe(false);
    expect(parseToolCall("moveTeacherTo", '{"spot":"center"}', transit).ok).toBe(false);
  });
  it("openWorld: only known worlds, not where we already are, not mid-flight", () => {
    expect(parseToolCall("openWorld", '{"world":"mars"}', room).ok).toBe(true);
    expect(parseToolCall("openWorld", '{"world":"mars"}', mars).ok).toBe(false);
    expect(parseToolCall("openWorld", '{"world":"classroom"}', mars).ok).toBe(true);
    expect(parseToolCall("openWorld", '{"world":"https://evil.example/x.glb"}', room).ok).toBe(false);
    expect(parseToolCall("openWorld", '{"world":"classroom"}', transit).ok).toBe(false);
  });
  it("offerChoices: 1-4 plain-text items with safe ids", () => {
    expect(parseToolCall("offerChoices", JSON.stringify({ choices: [{ id: "crater", label: "The crater" }] }), mars).ok).toBe(true);
    expect(parseToolCall("offerChoices", JSON.stringify({ choices: [] }), mars).ok).toBe(false);
    expect(parseToolCall("offerChoices", JSON.stringify({ choices: Array(5).fill({ id: "a", label: "b" }) }), mars).ok).toBe(false);
    expect(parseToolCall("offerChoices", JSON.stringify({ choices: [{ id: "<script>", label: "x" }] }), mars).ok).toBe(false);
    const r = parseToolCall("offerChoices", JSON.stringify({ choices: [{ id: "ok", label: "a".repeat(200) }] }), mars);
    expect(r.ok && r.command.name === "offerChoices" && r.command.choices[0].label.length).toBe(48);
  });
  it("rejects unknown commands and malformed input", () => {
    expect(parseToolCall("eval", '{"code":"alert(1)"}', room).ok).toBe(false);
    expect(parseToolCall("pointAt", "{not json", room).ok).toBe(false);
    expect(parseToolCall("pointAt", "[]", room).ok).toBe(false);
    expect(parseToolCall("gesture", '{"gesture":"__proto__"}', room).ok).toBe(false);
    expect(parseSceneCommand(42, {}, room).ok).toBe(false);
  });
  it("board text is plain, trimmed and capped", () => {
    const r = parseToolCall("writeOnBoard", JSON.stringify({ text: "  <img src=x onerror=1>\n" + "a".repeat(200) }), room);
    expect(r.ok).toBe(true);
    if (r.ok && r.command.name === "writeOnBoard") {
      expect(r.command.text.length).toBeLessThanOrEqual(60);
      expect(r.command.text).not.toMatch(/[\n\r]/);
    }
  });
  it("tool definitions for a model only offer what the current world has", () => {
    const names = (c: ReturnType<typeof contextFor>) => toolsFor(c).map((t) => t.name);
    expect(names(room)).toContain("writeOnBoard");
    expect(names(mars)).not.toContain("writeOnBoard");
    expect(names(mars)).toContain("inviteTap");
    expect(names(transit)).not.toContain("openWorld");
  });
});

import { ACTIONS } from "@/lib/scene/commands";
import { buildReply } from "@/lib/brain/server/sanitize";
import { WORLDS, type CommandContext } from "@/lib/worlds/registry";

describe("act: whole-body actions are an id from a fixed list, allowed per world", () => {
  const market = contextFor("market");
  // A made-up world with water and a climbing frame (no real world has either yet).
  const lake: CommandContext = { ...room, actions: [...ACTIONS] };
  it("accepts allowed ids", () => {
    for (const a of ["run", "jump", "eat", "sit", "clap"]) expect(parseToolCall("act", JSON.stringify({ action: a }), room)).toEqual({ ok: true, command: { name: "act", action: a } });
    expect(parseToolCall("act", '{"action":"jump"}', mars).ok).toBe(true);
    expect(parseToolCall("act", '{"action":"eat"}', market).ok).toBe(true);
  });
  it("world gating: swim and climb only where a world declares them; Mars has no eating", () => {
    for (const w of Object.values(WORLDS)) { expect(w.actions).not.toContain("swim"); expect(w.actions).not.toContain("climb"); }
    expect(parseToolCall("act", '{"action":"swim"}', room).ok).toBe(false);
    expect(parseToolCall("act", '{"action":"climb"}', market).ok).toBe(false);
    expect(parseToolCall("act", '{"action":"eat"}', mars).ok).toBe(false);
    expect(parseToolCall("act", '{"action":"swim"}', lake).ok).toBe(true);
    expect(parseToolCall("act", '{"action":"climb"}', lake).ok).toBe(true);
  });
  it("no acting while travelling", () => {
    expect(parseToolCall("act", '{"action":"jump"}', transit).ok).toBe(false);
    expect(toolsFor(transit).some((t) => t.name === "act")).toBe(false);
  });
  it("hostile ids are rejected, even when the list would let a string through", () => {
    for (const bad of ["__proto__", "constructor", "toString", "hasOwnProperty", "RUN", " run", "run ", "run;alert(1)", "https://evil.example/x.glb", "<script>", "", "fly", "dance"])
      expect(parseSceneCommand("act", { action: bad }, lake).ok, JSON.stringify(bad)).toBe(false);
    for (const bad of [undefined, null, 5, true, ["run"], { id: "run" }, { toString: () => "run" }])
      expect(parseSceneCommand("act", { action: bad }, lake).ok).toBe(false);
    expect(parseSceneCommand("act", {}, lake).ok).toBe(false);
    // A world that (wrongly) listed a non-action id still cannot make it valid.
    expect(parseSceneCommand("act", { action: "fly" }, { ...room, actions: ["fly"] }).ok).toBe(false);
  });
  it("extra fields (coordinates, code, urls) are never carried into the command", () => {
    const r = parseSceneCommand("act", { action: "run", x: 5, z: 9, url: "https://evil.example", code: "alert(1)" }, room);
    expect(r).toEqual({ ok: true, command: { name: "act", action: "run" } });
  });
  it("the tool schema lists only this world's actions", () => {
    const enumOf = (c: CommandContext) => (toolsFor(c).find((t) => t.name === "act")!.input_schema.properties as { action: { enum: string[] } }).action.enum;
    expect(enumOf(room)).toEqual(["run", "jump", "eat", "sit", "clap"]);
    expect(enumOf(mars)).toEqual(["run", "jump", "sit", "clap"]);
    expect(enumOf(lake)).toEqual([...ACTIONS]);
    expect(toolsFor({ ...room, actions: [] }).some((t) => t.name === "act")).toBe(false);
  });
  it("model replies: an act for another world is dropped, and only one act per reply survives", () => {
    const text = (t: string) => ({ type: "text", text: t });
    const tool = (name: string, input: unknown) => ({ type: "tool_use", id: "t", name, input });
    const r = buildReply([text("Watch this!"), tool("act", { action: "jump" }), tool("act", { action: "clap" }), tool("act", { action: "swim" })], "mars", { kind: "text", text: "x" })!;
    const acts = r.segments.flatMap((s) => s.actions ?? []).filter((a) => a.name === "act");
    expect(acts).toEqual([{ name: "act", args: { action: "jump" } }]);
    expect(r.dropped).toBe(2);
    const eatOnMars = buildReply([text("Yum."), tool("act", { action: "eat" })], "mars", { kind: "text", text: "x" })!;
    expect(eatOnMars.segments.flatMap((s) => s.actions ?? [])).toEqual([]);
  });
});
