import { describe, expect, it } from "vitest";
import { percentile, summarize, toResult, MIN_SAMPLES_FOR_VERDICT, type TurnResult } from "@/lib/telemetry/latency";
import { parseSceneCommand as psc, parseToolCall as ptc } from "@/lib/scene/commands";
import { contextFor } from "@/lib/worlds/registry";
const CTX = contextFor("classroom");
const parseSceneCommand = (n: unknown, a: unknown) => psc(n, a, CTX);
const parseToolCall = (n: string, a: string) => ptc(n, a, CTX);

/** Tester-added edge cases. `it.fails` = asserts desired behaviour that the code does not meet yet. */
const ok = (ms: number, cold = false): TurnResult => ({ turnId: 0, mode: "live", input: "voice", cold, endToAudioMs: ms, outcome: "ok" });
const failed = (): TurnResult => ({ turnId: 0, mode: "live", input: "voice", cold: false, outcome: "failed" });

describe("latency maths edges", () => {
  it("percentile bounds", () => {
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([1, 2, 3, 4], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4], 100)).toBe(4);
    expect(percentile([4, 1, 3, 2], 50)).toBe(2);
    const input = [3, 1, 2];
    percentile(input, 50);
    expect(input).toEqual([3, 1, 2]); // not mutated
  });
  it("verdict boundaries: exactly on target passes, 1 ms over fails, 19 samples gives no verdict", () => {
    const at = (m: number, worst: number) => summarize([...Array.from({ length: 18 }, () => ok(m)), ok(worst), ok(worst)], "live").meetsTarget;
    expect(at(2000, 4000)).toBe(true);
    expect(at(2001, 4000)).toBe(false);
    expect(at(2000, 4001)).toBe(false);
    expect(summarize(Array.from({ length: MIN_SAMPLES_FOR_VERDICT - 1 }, () => ok(100)), "live").meetsTarget).toBeNull();
  });
  it("warmOnly drops cold turns; modes never mix", () => {
    const rs = [ok(9000, true), ...Array.from({ length: 20 }, () => ok(1000)), { ...ok(1), mode: "demo" as const }];
    expect(summarize(rs, "live").samples).toBe(21);
    expect(summarize(rs, "live", { warmOnly: true }).samples).toBe(20);
    expect(summarize(rs, "demo").samples).toBe(1);
  });
  it("failures and interruptions are counted, not hidden in samples", () => {
    const s = summarize([ok(1000), failed(), { ...failed(), outcome: "interrupted" }], "live");
    expect(s).toMatchObject({ samples: 1, failures: 1, interrupted: 1 });
  });
  it("text turns report no VAD numbers; voice without mic estimate reports no VAD delay", () => {
    const t = toResult({ turnId: 1, mode: "live", input: "text", cold: false, textSubmit: 100, vadEnd: 50, utteranceEnd: 10, firstAudio: 600 });
    expect(t).toMatchObject({ endToAudioMs: 500, vadToAudioMs: undefined, vadDelayMs: undefined });
    const v = toResult({ turnId: 1, mode: "live", input: "voice", cold: false, vadEnd: 500, firstAudio: 900 });
    expect(v.vadDelayMs).toBeUndefined();
  });

  it("FIXED: 20 fast turns plus many timeouts must not be reported as meeting the target", () => {
    const rs = [...Array.from({ length: 20 }, () => ok(1500)), ...Array.from({ length: 20 }, failed)];
    // Half the turns never produced audio (each a >12 s wait). Actual: meetsTarget === true.
    expect(summarize(rs, "live").meetsTarget).not.toBe(true);
  });
  it("FIXED: a failure after audio began is still reported as a failure", () => {
    expect(toResult({ turnId: 1, mode: "live", input: "text", cold: false, textSubmit: 0, firstAudio: 900, failed: true }).outcome).toBe("failed");
  });
});

describe("scene command validation, hostile input", () => {
  const rejects = (name: unknown, args: unknown) => expect(parseSceneCommand(name, args).ok).toBe(false);
  it("rejects wrong types, prototype keys, case/whitespace variants and unknown names", () => {
    rejects("pointAt", { target: "Board" });
    rejects("pointAt", { target: " board" });
    rejects("pointAt", { target: "toString" });
    rejects("pointAt", Object.create({ target: "board" }).nothing);
    rejects("gesture", { gesture: ["wave"] });
    rejects("gesture", { gesture: { toString: () => "wave" } });
    rejects("moveTeacherTo", { spot: 0 });
    rejects("moveTeacherTo", []);
    rejects("moveTeacherTo", "center");
    rejects("hasOwnProperty", {});
    rejects("Gesture", { gesture: "wave" });
    rejects(["gesture"], { gesture: "wave" });
    rejects("writeOnBoard", { text: 42 });
    rejects("writeOnBoard", { text: " \n\t " });
    // openWorld is a real command since the world system (only for known worlds); the others stay unknown.
    for (const n of ["showDiagram", "askPracticeQuestion"]) rejects(n, { world: "mars" });
    rejects("openWorld", { world: "atlantis" });
  });
  it("output carries only whitelisted fields (no smuggled extras)", () => {
    const r = parseSceneCommand("pointAt", { target: "board", url: "https://evil.example", __proto__: { x: 1 }, code: "alert(1)" });
    expect(r).toEqual({ ok: true, command: { name: "pointAt", target: "board" } });
  });
  it("board text is capped at 60 and stripped of control characters", () => {
    const r = parseToolCall("writeOnBoard", JSON.stringify({ text: "a\u0000b\u001fc\u007f" + "x".repeat(200) }));
    expect(r.ok && r.command.name === "writeOnBoard" && r.command.text.length).toBe(60);
    expect(r.ok && r.command.name === "writeOnBoard" && /[\u0000-\u001f\u007f]/.test(r.command.text)).toBe(false);
  });
  it("malformed / non-object JSON is refused", () => {
    for (const raw of ["{", "[]", "null", "1", '"x"', "{}{}"]) expect(parseToolCall("gesture", raw).ok).toBe(false);
  });
  it("FIXED (low): invisible-only board text should be refused", () => {
    expect(parseSceneCommand("writeOnBoard", { text: "​‎‮﻿" }).ok).toBe(false);
  });
  it("FIXED (low): truncation should not leave half an emoji", () => {
    const r = parseSceneCommand("writeOnBoard", { text: "x".repeat(59) + "🚀" });
    expect(r.ok && r.command.name === "writeOnBoard" && /[\ud800-\udbff]$/.test(r.command.text)).toBe(false);
  });
});
