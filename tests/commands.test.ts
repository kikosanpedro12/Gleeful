import { describe, expect, it } from "vitest";
import { parseToolCall, parseSceneCommand } from "@/lib/scene/commands";

describe("scene command validation", () => {
  it("accepts prepared commands", () => {
    expect(parseToolCall("pointAt", '{"target":"mars_globe"}')).toEqual({ ok: true, command: { name: "pointAt", target: "mars_globe" } });
    expect(parseToolCall("gesture", '{"gesture":"wave"}').ok).toBe(true);
    expect(parseToolCall("moveTeacherTo", '{"spot":"board_side"}').ok).toBe(true);
  });
  it("rejects unknown commands, targets and malformed input", () => {
    expect(parseToolCall("eval", '{"code":"alert(1)"}').ok).toBe(false);
    expect(parseToolCall("pointAt", '{"target":"rock_1"}').ok).toBe(false);
    expect(parseToolCall("pointAt", '{"target":"https://evil.example/x.glb"}').ok).toBe(false);
    expect(parseToolCall("pointAt", "{not json").ok).toBe(false);
    expect(parseToolCall("pointAt", "[]").ok).toBe(false);
    expect(parseToolCall("gesture", '{"gesture":"__proto__"}').ok).toBe(false);
    expect(parseSceneCommand(42, {}).ok).toBe(false);
  });
  it("reserved Phase 2 commands are refused honestly, not silently run", () => {
    const r = parseToolCall("openWorld", '{"world":"mars"}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not available/);
  });
  it("board text is plain, trimmed and capped", () => {
    const r = parseToolCall("writeOnBoard", JSON.stringify({ text: "  <img src=x onerror=1>\n" + "a".repeat(200) }));
    expect(r.ok).toBe(true);
    if (r.ok && r.command.name === "writeOnBoard") {
      expect(r.command.text.length).toBeLessThanOrEqual(60);
      expect(r.command.text).not.toMatch(/[\n\r]/);
    }
    expect(parseToolCall("writeOnBoard", '{"text":"   "}').ok).toBe(false);
    expect(parseToolCall("writeOnBoard", '{"text":5}').ok).toBe(false);
  });
});
