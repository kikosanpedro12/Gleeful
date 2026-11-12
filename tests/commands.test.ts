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
