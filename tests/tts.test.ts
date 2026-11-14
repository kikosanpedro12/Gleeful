import { describe, expect, it, vi } from "vitest";
import { handleTts, makeTtsDeps, readTtsEnv, ttsStatus } from "@/lib/tts/handler";
import { readEnv } from "@/lib/brain/server/config";

vi.mock("server-only", () => ({}));

const CODE = "a-long-private-test-code-1234";
const brainEnv = readEnv({ BRAIN_TESTER_CODE: CODE });
const audio = () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-type": "audio/mpeg" } });

function deps(over: Record<string, unknown> = {}, env: Record<string, string> = { DEEPGRAM_API_KEY: "dg-secret-key" }) {
  const fetchImpl = vi.fn(async () => audio());
  return { d: makeTtsDeps({ env: readTtsEnv(env), brainEnv, fetchImpl: fetchImpl as unknown as typeof fetch, ...over }), fetchImpl };
}
const post = (body: unknown, headers: Record<string, string> = { "x-gleeful-tester": CODE }) =>
  new Request("http://localhost/api/tts", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const ok = { text: "Hello! Where should we go today?", voice: "aura-2-thalia-en" };

describe("/api/tts", () => {
  it("returns mp3 audio and sends the key only to Deepgram", async () => {
    const { d, fetchImpl } = deps();
    const r = await handleTts(post(ok), d);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("audio/mpeg");
    expect(JSON.stringify([...r.headers])).not.toMatch(/dg-secret-key/);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=mp3");
    expect((init.headers as Record<string, string>).Authorization).toBe("Token dg-secret-key");
  });
  it("is closed without a key, when disabled, or without a strong passcode configured", async () => {
    expect((await handleTts(post(ok), deps({}, {}).d)).status).toBe(503);
    expect((await handleTts(post(ok), deps({}, { DEEPGRAM_API_KEY: "k", TTS_DISABLED: "1" }).d)).status).toBe(503);
    expect((await handleTts(post(ok), deps({ brainEnv: readEnv({}) }).d)).status).toBe(503);
    expect((await handleTts(post(ok), deps({ brainEnv: readEnv({ BRAIN_TESTER_CODE: "short" }) }).d)).status).toBe(503);
  });
  it("refuses a missing or wrong passcode and never calls upstream", async () => {
    const { d, fetchImpl } = deps();
    expect((await handleTts(post(ok, {}), d)).status).toBe(403);
    expect((await handleTts(post(ok, { "x-gleeful-tester": "nope" }), d)).status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("accepts only listed voices and short plain text", async () => {
    const { d, fetchImpl } = deps();
    for (const body of [{ ...ok, voice: "aura-2-zeus-en&evil=1" }, { ...ok, voice: "../x" }, { ...ok, voice: 5 }, { text: "x".repeat(301), voice: ok.voice }, { text: "   ", voice: ok.voice }, { voice: ok.voice }, "not json"]) {
      expect((await handleTts(post(body), d)).status, JSON.stringify(body)).toBe(400);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("refuses another website's page", async () => {
    const { d } = deps();
    const r = await handleTts(post(ok, { "x-gleeful-tester": CODE, origin: "https://evil.example", host: "localhost" }), d);
    expect(r.status).toBe(403);
  });
  it("stops at the daily character ceiling, and refunds a failed upstream call", async () => {
    const { d } = deps({}, { DEEPGRAM_API_KEY: "k", TTS_DAILY_CHARS: "50" });
    expect((await handleTts(post(ok), d)).status).toBe(200); // 32 chars
    expect((await handleTts(post(ok), d)).status).toBe(429); // would be 64
    const bad = deps({ fetchImpl: vi.fn(async () => new Response("no", { status: 500 })) as unknown as typeof fetch }, { DEEPGRAM_API_KEY: "k", TTS_DAILY_CHARS: "50" });
    expect((await handleTts(post(ok), bad.d)).status).toBe(502);
    expect(bad.d.spent.chars).toBe(0);
  });
  it("the daily ceiling cannot be raised past the hard cap by configuration", () => {
    expect(readTtsEnv({ TTS_DAILY_CHARS: "99999999" }).dailyChars).toBe(300_000);
  });
  it("rate limits per address", async () => {
    const { d } = deps();
    let last = 200;
    for (let i = 0; i < 25; i++) last = (await handleTts(post({ text: "Hi", voice: ok.voice }), d)).status;
    expect(last).toBe(429);
  });
  it("a refund after UTC midnight goes to the day it was charged, never below zero", async () => {
    let t = Date.parse("2026-11-14T23:59:59Z");
    const fetchImpl = vi.fn(async () => { t += 5000; return new Response("no", { status: 500 }); });
    const { d } = deps({ fetchImpl: fetchImpl as unknown as typeof fetch, now: () => t });
    expect((await handleTts(post(ok), d)).status).toBe(502);
    expect(d.spent.chars).toBeGreaterThanOrEqual(0);
  });
  it("reports capability without secrets", () => {
    expect(ttsStatus(deps().d)).toEqual({ configured: true });
    expect(ttsStatus(deps({}, {}).d)).toEqual({ configured: false });
  });
});
