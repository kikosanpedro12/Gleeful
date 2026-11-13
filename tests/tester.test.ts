import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleBrain, makeDeps, testerOk, TESTER_HEADER } from "@/lib/brain/server/handler";
import { MemoryUsageStore } from "@/lib/brain/server/limits";
import { LIMITS, readEnv } from "@/lib/brain/server/config";
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
  it("closed by default: no passcode set and no parent sign-in means nobody reaches the model (401, nothing spent)", async () => {
    const f = upstream();
    const res = await handleBrain(http(), deps(f));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "sign_in_required" });
    expect(f).not.toHaveBeenCalled();
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

/** Parent sign-in: the other way in. The parent comes from the verified session (injected here), never from the request body. */
describe("server: signed-in parents", () => {
  const parentDeps = (f: ReturnType<typeof upstream>, p: { id: string; consented: boolean } | null | "throws", testerCode?: string) =>
    makeDeps({
      env: { apiKey: "test-key-not-real", disabled: false, testerCode }, usage: new MemoryUsageStore(), fetchImpl: f as unknown as typeof fetch, log: () => {},
      parent: async () => { if (p === "throws") throw new Error("auth down"); return p; },
    });
  const as = (learnerId: string, sessionId = "sess_1", headers: Record<string, string> = {}) =>
    new Request("https://gleeful.test/api/brain", { method: "POST", headers: { "content-type": "application/json", host: "gleeful.test", "x-forwarded-for": "203.0.113.9", ...headers }, body: JSON.stringify({ ...req, learnerId, sessionId }) });

  it("a signed-in parent with consent reaches the model", async () => {
    const f = upstream();
    expect((await handleBrain(http(), parentDeps(f, { id: "p-1", consented: true }))).status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("anonymous (no session): 401 sign_in_required, nothing spent", async () => {
    const f = upstream();
    const res = await handleBrain(http(), parentDeps(f, null));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("sign_in_required");
    expect(f).not.toHaveBeenCalled();
  });
  it("signed in but consent missing or withdrawn: 403 consent_required, nothing spent", async () => {
    const f = upstream();
    const res = await handleBrain(http(), parentDeps(f, { id: "p-1", consented: false }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("consent_required");
    expect(f).not.toHaveBeenCalled();
  });
  it("the session lookup failing is a refusal, never an open door or a 500", async () => {
    const f = upstream();
    const res = await handleBrain(http(), parentDeps(f, "throws"));
    expect(res.status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });
  it("a stale or wrong passcode in the browser does not lock out a signed-in parent", async () => {
    const f = upstream();
    expect((await handleBrain(http({ [TESTER_HEADER]: "stale-code" }), parentDeps(f, { id: "p-1", consented: true }, CODE))).status).toBe(200);
  });
  it("a wrong passcode with no session is told so (403 tester_required); the right one needs no session", async () => {
    const f = upstream();
    expect((await handleBrain(http({ [TESTER_HEADER]: "guess" }), parentDeps(f, null, CODE))).status).toBe(403);
    expect(f).not.toHaveBeenCalled();
    expect((await handleBrain(http({ [TESTER_HEADER]: CODE }), parentDeps(f, null, CODE))).status).toBe(200);
  });
  it("a passcode alone never unlocks consent: with a session lacking consent and no passcode, it stays shut", async () => {
    const f = upstream();
    expect((await handleBrain(http(), parentDeps(f, { id: "p-1", consented: false }, CODE))).status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });

  // THE LAUNCH BLOCKER: the browser picks learnerId and sessionId. Rotating them must not buy more spend.
  it("rotating learnerId and sessionId does not reset a parent's daily budget", async () => {
    const f = upstream();
    const usage = new MemoryUsageStore();
    const d = makeDeps({ env: { apiKey: "test-key-not-real", disabled: false }, usage, fetchImpl: f as unknown as typeof fetch, log: () => {}, parent: async () => ({ id: "p-1", consented: true }), now: () => Date.UTC(2026, 10, 13, 12) });
    // (reserveParent only counts a parent already seen, so one real call first)
    await handleBrain(as("fresh-learner-0", "fresh-session-0"), d);
    for (let i = 0; i < LIMITS.dailyTurnsPerParent; i++) await usage.reserveParent("p-1", d.now(), false);
    const res = await handleBrain(as("fresh-learner-1", "fresh-session-1"), d);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toBe("daily_limit");
  });
  it("another parent is unaffected by that parent's budget, and cannot burn it by guessing ids", async () => {
    const f = upstream();
    const usage = new MemoryUsageStore();
    const now = () => Date.UTC(2026, 10, 13, 12);
    const dA = makeDeps({ env: { apiKey: "test-key-not-real", disabled: false }, usage, fetchImpl: f as unknown as typeof fetch, log: () => {}, parent: async () => ({ id: "p-A", consented: true }), now });
    const dB = { ...dA, parent: async () => ({ id: "p-B", consented: true }) };
    await handleBrain(as("shared-learner-id"), dA);
    await handleBrain(as("shared-learner-id"), dB);
    const a = (await usage.today("p-A:shared-learner-id", "Asia/Manila", now()))!;
    const b = (await usage.today("p-B:shared-learner-id", "Asia/Manila", now()))!;
    expect(a.turns).toBe(1);
    expect(b.turns).toBe(1);
    expect((await usage.parentToday("p-A", now()))!.turns).toBe(1);
    expect((await usage.parentToday("p-B", now()))!.turns).toBe(1);
  });
  it("the parent table is bounded and fails closed when full of live parents", async () => {
    const usage = new MemoryUsageStore(3);
    const t = Date.UTC(2026, 10, 13, 12);
    for (let i = 0; i < 3; i++) expect(await usage.parentToday(`p-${i}`, t)).not.toBeNull();
    expect(await usage.parentToday("p-new", t)).toBeNull();
    expect((await usage.parentToday("p-0", t))).not.toBeNull(); // a live one is never evicted
  });
  it("the sonnet (hard) budget is per parent too", async () => {
    const usage = new MemoryUsageStore();
    const t = Date.UTC(2026, 10, 13, 12);
    await usage.parentToday("p-1", t);
    for (let i = 0; i < LIMITS.dailyHardTurnsPerParent; i++) await usage.reserveParent("p-1", t, true);
    expect((await usage.parentToday("p-1", t))!.hardTurns).toBe(LIMITS.dailyHardTurnsPerParent);
    expect((await usage.parentToday("p-2", t))!.hardTurns).toBe(0);
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
  const probe = (testerRequired: boolean, access: { signedIn: boolean; consented: boolean } = { signedIn: false, consented: false }) =>
    new Response(JSON.stringify({ configured: true, testerRequired, ...access }), { status: 200 });
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
  it("a consented signed-in parent without a passcode in this tab: POSTs, with no passcode header", async () => {
    const f = fetchOf(probe(true, { signedIn: true, consented: true }), ok());
    await new ClaudeBrain({ fetchImpl: f as unknown as typeof fetch, probe: true }).respond({ kind: "text", text: "hi" }, ctx());
    expect((f.mock.calls[1][1] as { method: string }).method).toBe("POST");
    expect((f.mock.calls[1][1] as { headers: Record<string, string> }).headers[TESTER_HEADER]).toBeUndefined();
  });
  it("accounts only (no passcode accepted): a stored passcode is not sent", async () => {
    const f = fetchOf(probe(false, { signedIn: true, consented: true }), ok());
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
