import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleBrain, makeDeps, testerOk, TESTER_HEADER } from "@/lib/brain/server/handler";
import { MemoryUsageStore } from "@/lib/brain/server/limits";
import { readEnv } from "@/lib/brain/server/config";
import { ClaudeBrain, resetProbeCache } from "@/lib/brain/claudeBrain";
import { FallbackBrain } from "@/lib/brain/fallbackBrain";
import { ScriptedBrain } from "@/lib/brain/scriptedBrain";
import { getTesterCode, setTesterCode, clearTesterCode, TESTER_KEY } from "@/lib/brain/tester";
import { emptyProfile } from "@/lib/learner/profile";
import type { BrainContext } from "@/lib/brain/types";
import type { BrainRequest } from "@/lib/brain/protocol";

/** Private-test passcode (BRAIN_TESTER_CODE): a real key can sit behind a public URL only for people who have the code. */
const CODE = "kiko-private-test-7f3a9c";
const req: BrainRequest = {
  v: 1, learnerId: "learner_1", sessionId: "sess_1", tz: "Asia/Manila", world: "mars", teacher: "leo", session: 1,
  input: { kind: "text", text: "why is it red?" }, hintsUsed: 0, history: [], skills: [],
};
const http = (headers: Record<string, string> = {}) => new Request("https://gleeful.test/api/brain", {
  method: "POST", headers: { "content-type": "application/json", host: "gleeful.test", "x-forwarded-for": "203.0.113.9", ...headers }, body: JSON.stringify(req),
});
const upstream = () => vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "Iron rusted." }], usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 }));
const deps = (f: ReturnType<typeof upstream>, testerCode?: string) =>
  makeDeps({ env: { apiKey: "test-key-not-real", disabled: false, testerCode }, usage: new MemoryUsageStore(), fetchImpl: f as unknown as typeof fetch, log: () => {} });

describe("server: tester passcode gate", () => {
  it("off when BRAIN_TESTER_CODE is unset (unchanged behaviour)", async () => {
    const f = upstream();
    expect((await handleBrain(http(), deps(f))).status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("no header → 403 tester_required, and the model is never called", async () => {
    const f = upstream();
    const res = await handleBrain(http(), deps(f, CODE));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "tester_required" });
    expect(f).not.toHaveBeenCalled();
  });
  it("wrong, prefix, longer, padded or differently-cased codes are refused", async () => {
    for (const bad of ["nope", CODE.slice(0, -1), CODE + "x", ` ${CODE}x`, CODE.toUpperCase(), "", "a".repeat(5000)]) {
      const f = upstream();
      const res = await handleBrain(http({ [TESTER_HEADER]: bad }), deps(f, CODE));
      expect(res.status, JSON.stringify(bad.slice(0, 20))).toBe(403);
      expect(f).not.toHaveBeenCalled();
    }
  });
  it("the right code goes through", async () => {
    const f = upstream();
    expect((await handleBrain(http({ [TESTER_HEADER]: CODE }), deps(f, CODE))).status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("the refusal never echoes the code or hints at it", async () => {
    const res = await handleBrain(http({ [TESTER_HEADER]: "guess" }), deps(upstream(), CODE));
    const text = await res.text();
    expect(text).not.toContain(CODE);
    expect(text).not.toContain("guess");
  });
  it("guesses are rate limited per address like any other request", async () => {
    const d = deps(upstream(), CODE);
    const codes: number[] = [];
    for (let i = 0; i < 40; i++) codes.push((await handleBrain(http({ [TESTER_HEADER]: `g${i}` }), d)).status);
    expect(codes).toContain(429);
  });
  it("testerOk compares SHA-256 digests with timingSafeEqual: right code passes, missing, wrong or doubled code fails", () => {
    expect(testerOk(undefined, null)).toBe(true);
    expect(testerOk(CODE, null)).toBe(false);
    expect(testerOk(CODE, CODE)).toBe(true);
    expect(testerOk(CODE, CODE + CODE)).toBe(false);
  });
  it("readEnv reads and trims BRAIN_TESTER_CODE; blank means off", () => {
    expect(readEnv({ BRAIN_TESTER_CODE: `  ${CODE} ` }).testerCode).toBe(CODE);
    expect(readEnv({ BRAIN_TESTER_CODE: "   " }).testerCode).toBeUndefined();
    expect(readEnv({}).testerCode).toBeUndefined();
  });
  it("a BRAIN_TESTER_CODE under 16 characters is a misconfiguration: model never called, script answers", async () => {
    expect(readEnv({ BRAIN_TESTER_CODE: "short-code" }).testerMisconfigured).toBe(true);
    expect(readEnv({ BRAIN_TESTER_CODE: "exactly-16-chars" }).testerMisconfigured).toBe(false);
    expect(readEnv({}).testerMisconfigured).toBe(false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = upstream();
    const d = makeDeps({ env: { apiKey: "test-key-not-real", disabled: false, testerCode: "short-code", testerMisconfigured: true }, usage: new MemoryUsageStore(), fetchImpl: f as unknown as typeof fetch, log: () => {} });
    const res = await handleBrain(http({ [TESTER_HEADER]: "short-code" }), d);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("brain_unconfigured");
    expect(f).not.toHaveBeenCalled();
    await handleBrain(http({ [TESTER_HEADER]: "short-code" }), d);
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    for (const c of warn.mock.calls) expect(String(c[0])).not.toContain("short-code");
    warn.mockRestore();
  });
});

describe("browser: passcode storage and header", () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } });
    resetProbeCache();
  });
  afterEach(() => { vi.unstubAllGlobals(); resetProbeCache(); });
  const ctx = (): BrainContext => { const p = emptyProfile(); return { world: "mars", teacher: "leo", teacherName: "Leo", profile: p, session: 1, record: () => {} }; };
  const fetchOf = (...rs: Response[]) => { const q = [...rs]; return vi.fn(async (_u: unknown, _i?: unknown) => (q.shift() ?? q[0]).clone()); };
  const probe = (testerRequired: boolean) => new Response(JSON.stringify({ configured: true, testerRequired }), { status: 200 });
  const ok = () => new Response(JSON.stringify({ segments: [{ say: "Hi!" }], model: "default" }), { status: 200 });

  it("stores trimmed codes in this tab only, rejects empty or huge ones, and can forget", () => {
    expect(setTesterCode("  abc  ")).toBe(true);
    expect(store[TESTER_KEY]).toBe("abc");
    expect(getTesterCode()).toBe("abc");
    expect(setTesterCode("   ")).toBe(false);
    expect(setTesterCode("x".repeat(201))).toBe(false);
    clearTesterCode();
    expect(getTesterCode()).toBeNull();
  });
  it("storage that throws (private mode) is handled", () => {
    vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } });
    expect(getTesterCode()).toBeNull();
    expect(setTesterCode("abc")).toBe(false);
    expect(() => clearTesterCode()).not.toThrow();
  });
  it("gate on and no code in this tab: never POSTs; the script answers", async () => {
    const f = fetchOf(probe(true));
    const b = new FallbackBrain(new ClaudeBrain({ fetchImpl: f as unknown as typeof fetch, probe: true }), new ScriptedBrain());
    const r = await b.respond({ kind: "session_start" }, ctx());
    expect(b.kind).toBe("scripted");
    expect(r.segments.length).toBeGreaterThan(0);
    expect(f.mock.calls.map((c) => (c[1] as { method: string }).method)).toEqual(["GET"]);
  });
  it("with a code: sends it in the header", async () => {
    setTesterCode(CODE);
    const f = fetchOf(probe(true), ok());
    await new ClaudeBrain({ fetchImpl: f as unknown as typeof fetch, probe: true }).respond({ kind: "text", text: "hi" }, ctx());
    expect((f.mock.calls[1][1] as { headers: Record<string, string> }).headers[TESTER_HEADER]).toBe(CODE);
  });
  it("without the gate, no passcode header is sent even if one is stored", async () => {
    const f = fetchOf(probe(false), ok());
    await new ClaudeBrain({ fetchImpl: f as unknown as typeof fetch, probe: true }).respond({ kind: "text", text: "hi" }, ctx());
    expect((f.mock.calls[1][1] as { headers: Record<string, string> }).headers[TESTER_HEADER]).toBeUndefined();
  });
  it("a wrong code (403 tester_required) is forgotten so /tester asks again, and the script answers", async () => {
    setTesterCode("wrong");
    const f = fetchOf(probe(true), new Response(JSON.stringify({ error: "tester_required" }), { status: 403 }));
    const b = new FallbackBrain(new ClaudeBrain({ fetchImpl: f as unknown as typeof fetch, probe: true }), new ScriptedBrain());
    await b.respond({ kind: "text", text: "hi" }, ctx());
    expect(b.kind).toBe("scripted");
    expect(getTesterCode()).toBeNull();
  });
});
