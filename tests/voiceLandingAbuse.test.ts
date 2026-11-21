import { afterEach, describe, expect, it, vi } from "vitest";
import { readEnv } from "@/lib/brain/server/config";
import { ELEVEN_LIMITS, handleVoice, makeElevenDeps, readElevenEnv } from "@/lib/tts/elevenHandler";

vi.mock("server-only", () => ({}));

/**
 * Tester attacks on the anonymous landing voice pool (x-gleeful-voice: landing). Anyone can send this header, and the route
 * speaks whatever TEXT they send (it is not tied to a taste answer). What is promised: size cap, per-address bucket, a
 * 5,000-character daily pool, no logging of the text. Moderation of the text is NOT part of the promise (see SECURITY.md).
 */
const pcm = () => new Response(new Uint8Array([1, 0, 2, 0]), { status: 200 });
const make = (extra: Record<string, string> = {}, fetchImpl = vi.fn(async () => pcm())) =>
  ({ d: makeElevenDeps({ env: readElevenEnv({ ELEVENLABS_API_KEY: "k", ...extra }), brainEnv: readEnv({}), fetchImpl: fetchImpl as unknown as typeof fetch }), fetchImpl });
const req = (ip: string | null, text: unknown, headers: Record<string, string> = { "x-gleeful-voice": "landing" }, raw?: string) =>
  new Request("http://localhost/api/voice", { method: "POST", headers: { "content-type": "application/json", ...(ip ? { "x-forwarded-for": ip } : {}), ...headers }, body: raw ?? JSON.stringify({ text, teacher: "mia" }) });

afterEach(() => vi.restoreAllMocks());

describe("landing voice: what an anonymous caller can and cannot do", () => {
  it("one address: at most the per-address bucket (700 by default) per day, however it slices the text", async () => {
    const { d, fetchImpl } = make();
    let spoken = 0;
    for (let i = 0; i < 40; i++) { const t = "a".repeat(37); if ((await handleVoice(req("198.51.100.7", t), d)).status === 200) spoken += t.length; }
    expect(spoken).toBeLessThanOrEqual(700);
    expect(fetchImpl.mock.calls.length * 37).toBeLessThanOrEqual(700);
  });
  it("rotating the forwarded address cannot lift the pool above 5,000 characters, and the upstream is never called past it", async () => {
    const { d, fetchImpl } = make();
    let spoken = 0;
    for (let i = 0; i < 200; i++) { const t = "b".repeat(300); if ((await handleVoice(req(`203.0.${i % 250}.${(i * 7) % 250}`, t), d)).status === 200) spoken += t.length; }
    expect(spoken).toBeLessThanOrEqual(5_000);
    expect(fetchImpl.mock.calls.length * 300).toBeLessThanOrEqual(5_000);
  });
  it("a request with no usable forwarded address shares ONE bucket (unknown), it cannot mint fresh ones", async () => {
    const { d } = make();
    let ok = 0;
    for (let i = 0; i < 10; i++) if ((await handleVoice(req(null, "c".repeat(300)), d)).status === 200) ok++;
    for (const junk of ["not an ip", "<script>", "x".repeat(200)]) if ((await handleVoice(req(junk, "c".repeat(300)), d)).status === 200) ok++;
    expect(ok * 300).toBeLessThanOrEqual(700);
  });
  it("oversized bodies are refused before any call: 2 KB+ body, 300+ chars of text, non-string text, bad teacher, non-JSON", async () => {
    const { d, fetchImpl } = make();
    const cases: Request[] = [
      req("192.0.2.1", "x".repeat(10_240)),
      req("192.0.2.1", "x".repeat(301)),
      req("192.0.2.1", ["a"]),
      req("192.0.2.1", { toString: 1 }),
      req("192.0.2.1", null),
      req("192.0.2.1", "ok", undefined, "not json"),
      req("192.0.2.1", "ok", undefined, JSON.stringify({ text: "ok", teacher: "__proto__" })),
      req("192.0.2.1", "   \n\t  "),
    ];
    for (const c of cases) expect([400, 413]).toContain((await handleVoice(c, d)).status);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("the landing header grants nothing without the switch: public/other header values need ELEVEN_PUBLIC, a wrong value is refused", async () => {
    const { d, fetchImpl } = make();
    for (const h of ["public", "Landing", "landing,public", "1", ""]) expect((await handleVoice(req("192.0.2.2", "hello", { "x-gleeful-voice": h }), d)).status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("cross-origin browsers cannot use it (a page on another site)", async () => {
    const { d, fetchImpl } = make();
    const r = req("192.0.2.3", "hello", { "x-gleeful-voice": "landing", origin: "https://evil.example", "sec-fetch-site": "cross-site" });
    expect((await handleVoice(r, d)).status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("never logs the text, the address, or the key (success, upstream failure, throw)", async () => {
    const secretText = "my private words zebra-7731";
    const spies = (["log", "warn", "error", "info", "debug"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    for (const f of [vi.fn(async () => pcm()), vi.fn(async () => new Response("no", { status: 401 })), vi.fn(async () => { throw new Error(`boom ${secretText}`); })]) {
      const { d } = make({}, f);
      await handleVoice(req("192.0.2.9", secretText), d);
    }
    const out = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(out).not.toContain("zebra-7731");
    expect(out).not.toContain("192.0.2.9");
    expect(out).not.toContain("\"k\"");
  });
  it("the upstream request carries only the cleaned text and the configured model/voice (no caller-chosen fields)", async () => {
    const { d, fetchImpl } = make();
    const r = new Request("http://localhost/api/voice", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.4", "x-gleeful-voice": "landing" },
      body: JSON.stringify({ text: "hi\u0000 there\n\n", teacher: "leo", model_id: "eleven_v3", voice_id: "evil", voice_settings: { x: 1 }, output_format: "mp3_44100_128" }) });
    expect((await handleVoice(r, d)).status).toBe(200);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toContain("api.elevenlabs.io/v1/text-to-speech/");
    expect(url).toContain("output_format=pcm_24000");
    expect(Object.keys(JSON.parse(init.body)).sort()).toEqual(["model_id", "text"]);
    expect(JSON.parse(init.body).text).toBe("hi there");
    expect(JSON.parse(init.body).model_id).not.toBe("eleven_v3");
  });
  it("hard ceilings are constants the env cannot raise", () => {
    expect(readElevenEnv({ ELEVEN_LANDING_DAILY_CHARS: "999999999", ELEVEN_ANON_IP_CHARS: "999999" }).landingDailyChars).toBe(5_000);
    expect(readElevenEnv({ ELEVEN_ANON_IP_CHARS: "999999" }).anonIpDailyChars).toBe(2_000);
    expect(ELEVEN_LIMITS.maxBodyBytes).toBe(2048);
  });
});
