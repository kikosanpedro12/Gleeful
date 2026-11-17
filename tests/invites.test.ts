import { describe, expect, it, vi } from "vitest";
import { parseInvites, matchInvite } from "@/lib/brain/server/invites";
import { readEnv } from "@/lib/brain/server/config";
import { testerPrincipal } from "@/lib/brain/server/handler";
import { ELEVEN_DEFAULT_VOICES, handleVoice, makeElevenDeps, readElevenEnv } from "@/lib/tts/elevenHandler";

vi.mock("server-only", () => ({}));

const A = "alice-code-0123456789abcd", B = "bob-code-0123456789abcdef", MASTER = "master-code-0123456789abc";
const RAW = `alice:${A}, Bob:${B}`;

describe("invites", () => {
  it("parses valid entries and skips malformed, short, duplicate and over-long ones", () => {
    expect(parseInvites(RAW)).toEqual([{ name: "alice", code: A }, { name: "bob", code: B }]);
    expect(parseInvites("nocolon,:x,bad name:" + A + ",short:abc,alice:" + A + ",alice:" + B + ",carol:" + A + ",x".repeat(3))).toEqual([{ name: "alice", code: A }]);
    expect(parseInvites(undefined)).toEqual([]);
    expect(parseInvites(Array.from({ length: 80 }, (_, i) => `u${i}:code-${String(i).padStart(2, "0")}-0123456789abcdef`).join(",")).length).toBe(50);
  });
  it("matches by code only, never a prefix, empty or null", () => {
    const inv = parseInvites(RAW);
    expect(matchInvite(inv, A)).toBe("alice");
    expect(matchInvite(inv, B)).toBe("bob");
    expect(matchInvite(inv, A.slice(0, 20))).toBeNull();
    expect(matchInvite(inv, "")).toBeNull();
    expect(matchInvite(inv, null)).toBeNull();
    expect(matchInvite([], A)).toBeNull();
  });
  it("principal: master is 'tester', an invite is 'tester:<name>', anything else is null", () => {
    const env = readEnv({ BRAIN_TESTER_CODE: MASTER, TESTER_INVITES: RAW });
    expect(testerPrincipal(env, MASTER)).toBe("tester");
    expect(testerPrincipal(env, A)).toBe("tester:alice");
    expect(testerPrincipal(env, "nope")).toBeNull();
    expect(testerPrincipal(readEnv({ TESTER_INVITES: RAW }), A)).toBe("tester:alice"); // invites alone are enough
    expect(testerPrincipal(readEnv({}), A)).toBeNull();
  });
});

describe("voice per-tester cap", () => {
  const pcm = () => new Response(new Uint8Array([1, 0, 2, 0]), { status: 200 });
  const make = (extra: Record<string, string> = {}) => {
    const fetchImpl = vi.fn(async () => pcm());
    const d = makeElevenDeps({ env: readElevenEnv({ ELEVENLABS_API_KEY: "k", ...extra }), brainEnv: readEnv({ TESTER_INVITES: RAW, BRAIN_TESTER_CODE: MASTER }), fetchImpl: fetchImpl as unknown as typeof fetch });
    return { d, fetchImpl };
  };
  const post = (code: string, text = "Hello! Where should we go today?") =>
    new Request("http://localhost/api/voice", { method: "POST", headers: { "content-type": "application/json", "x-gleeful-tester": code }, body: JSON.stringify({ text, teacher: "leo" }) });

  it("accepts an invite code, and caps each tester separately", async () => {
    const { d } = make({ ELEVEN_TESTER_DAILY_CHARS: "50" });
    expect((await handleVoice(post(A), d)).status).toBe(200); // 32
    const second = await handleVoice(post(A), d); // would be 64
    expect(second.status).toBe(429);
    expect(((await second.json()) as { error: string }).error).toBe("tester_daily_limit");
    expect((await handleVoice(post(B), d)).status).toBe(200); // bob has his own bucket
    expect((await handleVoice(post(MASTER), d)).status).toBe(200); // master is another bucket
  });
  it("a refused upstream call refunds the tester's bucket too", async () => {
    const { d } = make({ ELEVEN_TESTER_DAILY_CHARS: "50" });
    d.fetchImpl = vi.fn(async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    expect((await handleVoice(post(A), d)).status).toBe(502);
    expect(d.perTester.get("tester:alice")!.chars).toBe(0);
    expect(d.spent.chars).toBe(0);
  });
  it("the site-wide ceiling still applies across testers", async () => {
    const { d } = make({ ELEVEN_DAILY_CHARS: "50" });
    expect((await handleVoice(post(A), d)).status).toBe(200);
    expect((await handleVoice(post(B), d)).status).toBe(429);
  });
  it("a wrong code is refused and costs nothing; a revoked invite stops working", async () => {
    const { d, fetchImpl } = make();
    expect((await handleVoice(post("not-a-real-code-0000"), d)).status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
    d.brainEnv = readEnv({ TESTER_INVITES: `bob:${B}` });
    expect((await handleVoice(post(A), d)).status).toBe(403);
    expect((await handleVoice(post(B), d)).status).toBe(200);
  });
  it("is closed with no master code and no invites; clamps the per-tester cap", async () => {
    const { d } = make();
    d.brainEnv = readEnv({});
    expect((await handleVoice(post(A), d)).status).toBe(503);
    expect(readElevenEnv({ ELEVEN_TESTER_DAILY_CHARS: "999999" }).testerDailyChars).toBe(20_000);
    expect(readElevenEnv({}).testerDailyChars).toBe(6_000);
    void ELEVEN_DEFAULT_VOICES;
  });
});

describe("brain accepts an invite", () => {
  it("an invite opens the model with its own owner; a revoked one is refused", async () => {
    const { handleBrain, makeDeps } = await import("@/lib/brain/server/handler");
    const { MemoryUsageStore } = await import("@/lib/brain/server/limits");
    const body = { v: 1, learnerId: "l1", sessionId: "s1", tz: "Asia/Manila", world: "mars", teacher: "leo", session: 1, input: { kind: "text", text: "why is it red?" }, hintsUsed: 0, history: [], skills: [] };
    const http = (code: string) => new Request("https://gleeful.test/api/brain", { method: "POST", headers: { "content-type": "application/json", host: "gleeful.test", "x-forwarded-for": "203.0.113.9", "x-gleeful-tester": code }, body: JSON.stringify(body) });
    const f = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "Iron rusted." }], usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 }));
    const usage = new MemoryUsageStore();
    const mk = (raw: string) => makeDeps({ env: { ...readEnv({ TESTER_INVITES: raw }), apiKey: "test-key-not-real", disabled: false }, usage, fetchImpl: f as unknown as typeof fetch, log: () => {} });
    expect((await handleBrain(http(A), mk(RAW))).status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
    expect((await handleBrain(http(A), mk(`bob:${B}`))).status).toBe(403); // alice revoked
    expect((await handleBrain(http("wrong-code-0123456789"), mk(RAW))).status).toBe(403);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
