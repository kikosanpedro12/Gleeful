import { describe, expect, it, vi } from "vitest";
import { ELEVEN_DEFAULT_VOICES, handleVoice, makeElevenDeps, readElevenEnv, voiceStatus } from "@/lib/tts/elevenHandler";
import { readEnv } from "@/lib/brain/server/config";
import { pcm16ToFloat32 } from "@/lib/voice/elevenPlayer";

vi.mock("server-only", () => ({}));

const CODE = "a-long-private-test-code-1234";
const KEY = "xi-secret-key-should-never-leak";
const brainEnv = readEnv({ BRAIN_TESTER_CODE: CODE });
const pcm = () => new Response(new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0]), { status: 200, headers: { "content-type": "audio/pcm" } });

function deps(over: Record<string, unknown> = {}, env: Record<string, string> = { ELEVENLABS_API_KEY: KEY }) {
  const fetchImpl = vi.fn(async () => pcm());
  return { d: makeElevenDeps({ env: readElevenEnv(env), brainEnv, fetchImpl: fetchImpl as unknown as typeof fetch, ...over }), fetchImpl };
}
const post = (body: unknown, headers: Record<string, string> = { "x-gleeful-tester": CODE }) =>
  new Request("http://localhost/api/voice", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const ok = { text: "Hello! Where should we go today?", teacher: "leo" };

describe("/api/voice", () => {
  it("streams PCM, sends the key only to ElevenLabs, maps teacher to a server-side voice", async () => {
    const { d, fetchImpl } = deps();
    const r = await handleVoice(post(ok), d);
    expect(r.status).toBe(200);
    expect(r.headers.get("x-sample-rate")).toBe("24000");
    expect(new Uint8Array(await r.arrayBuffer()).length).toBe(8);
    expect(JSON.stringify([...r.headers])).not.toContain(KEY);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_DEFAULT_VOICES.leo}/stream?output_format=pcm_24000`);
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe(KEY);
    expect(JSON.parse(init.body as string)).toEqual({ text: ok.text, model_id: "eleven_v4_turbo" });
  });
  it("is closed without a key, when disabled, or without a strong passcode", async () => {
    expect((await handleVoice(post(ok), deps({}, {}).d)).status).toBe(503);
    expect((await handleVoice(post(ok), deps({}, { ELEVENLABS_API_KEY: "k", TTS_DISABLED: "1" }).d)).status).toBe(503);
    expect((await handleVoice(post(ok), deps({ brainEnv: readEnv({}) }, { ELEVENLABS_API_KEY: KEY, ELEVEN_LANDING: "off" }).d)).status).toBe(503);
    // With the landing pool on (the default when a key is set), a request without a passcode or the landing header is refused, never spoken.
    const open = deps({ brainEnv: readEnv({}) });
    expect((await handleVoice(post(ok), open.d)).status).toBe(403);
    expect(open.fetchImpl).not.toHaveBeenCalled();
    expect((await handleVoice(post(ok), deps({ brainEnv: readEnv({ BRAIN_TESTER_CODE: "short" }) }).d)).status).toBe(503);
  });
  it("refuses a missing or wrong passcode and never calls upstream", async () => {
    const { d, fetchImpl } = deps();
    expect((await handleVoice(post(ok, {}), d)).status).toBe(403);
    expect((await handleVoice(post(ok, { "x-gleeful-tester": "nope" }), d)).status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("accepts only known teachers and short plain text; ignores a client-sent voice or model", async () => {
    const { d, fetchImpl } = deps();
    for (const body of [{ ...ok, teacher: "../x" }, { ...ok, teacher: "constructor" }, { ...ok, teacher: 5 }, { text: "x".repeat(301), teacher: "mia" }, { text: "  ", teacher: "mia" }, { teacher: "mia" }, "not json"]) {
      expect((await handleVoice(post(body), d)).status, JSON.stringify(body)).toBe(400);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    await handleVoice(post({ ...ok, teacher: "mia", voice_id: "evil", model_id: "evil" }), d);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(ELEVEN_DEFAULT_VOICES.mia);
    expect(init.body as string).not.toContain("evil");
  });
  it("refuses another website's page", async () => {
    const r = await handleVoice(post(ok, { "x-gleeful-tester": CODE, origin: "https://evil.example", host: "localhost" }), deps().d);
    expect(r.status).toBe(403);
  });
  it("stops at the daily ceiling, refunds a clean upstream refusal only", async () => {
    const { d } = deps({}, { ELEVENLABS_API_KEY: "k", ELEVEN_DAILY_CHARS: "50" });
    expect((await handleVoice(post(ok), d)).status).toBe(200);
    expect((await handleVoice(post(ok), d)).status).toBe(429);
    const bad = deps({ fetchImpl: vi.fn(async () => new Response("no", { status: 500 })) as unknown as typeof fetch }, { ELEVENLABS_API_KEY: "k" });
    expect((await handleVoice(post(ok), bad.d)).status).toBe(502);
    expect(bad.d.spent.chars).toBe(0);
    const boom = deps({ fetchImpl: vi.fn(async () => { throw new Error("net"); }) as unknown as typeof fetch }, { ELEVENLABS_API_KEY: "k" });
    expect((await handleVoice(post(ok), boom.d)).status).toBe(502);
    expect(boom.d.spent.chars).toBe(ok.text.length);
  });
  it("clamps the daily ceiling and rejects unknown models and malformed voice ids", () => {
    expect(readElevenEnv({ ELEVEN_DAILY_CHARS: "9999999" }).dailyChars).toBe(100_000);
    expect(readElevenEnv({ ELEVEN_MODEL: "evil" }).model).toBe("eleven_v4_turbo");
    expect(readElevenEnv({ ELEVEN_VOICE_LEO: "../x" }).voices.leo).toBe(ELEVEN_DEFAULT_VOICES.leo);
    expect(readElevenEnv({ ELEVEN_VOICE_LEO: "A".repeat(20) }).voices.leo).toBe("A".repeat(20));
  });
  it("aborts audio over the byte cap", async () => {
    const big = new Response(new Uint8Array(3 * 1024 * 1024 + 10), { status: 200 });
    const { d } = deps({ fetchImpl: vi.fn(async () => big) as unknown as typeof fetch });
    const r = await handleVoice(post(ok), d);
    await expect(r.arrayBuffer()).rejects.toThrow();
  });
  it("status reports booleans only, and probes only with the passcode", async () => {
    const { d, fetchImpl } = deps({ fetchImpl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch });
    const s = await voiceStatus(new Request("http://localhost/api/voice"), d);
    expect(s.body).toMatchObject({ configured: true, standInVoices: true });
    expect(JSON.stringify(s.body)).not.toContain(KEY);
    const noCode = await voiceStatus(new Request("http://localhost/api/voice?probe=1"), d);
    expect(noCode.status).toBe(403);
    const withCode = await voiceStatus(new Request("http://localhost/api/voice?probe=1", { headers: { "x-gleeful-tester": CODE } }), d);
    expect(withCode.body).toMatchObject({ keyValid: true, upstreamStatus: 200 });
    expect(JSON.stringify(withCode.body)).not.toContain(KEY);
    void fetchImpl;
  });
});

describe("pcm16ToFloat32", () => {
  it("converts little-endian samples and carries an odd byte", () => {
    const a = pcm16ToFloat32(new Uint8Array([0, 128, 255, 127, 7]));
    expect(a.samples[0]).toBe(-1);
    expect(a.samples[1]).toBeCloseTo(32767 / 32768);
    expect(a.rest).toBe(7);
    const b = pcm16ToFloat32(new Uint8Array([0]), a.rest);
    expect(b.samples.length).toBe(1);
    expect(b.rest).toBeNull();
  });
});
