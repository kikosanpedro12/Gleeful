import { afterEach, describe, expect, it, vi } from "vitest";
import { readEnv } from "@/lib/brain/server/config";
import { ELEVEN_LIMITS, handleVoice, makeElevenDeps, readElevenEnv, voiceStatus } from "@/lib/tts/elevenHandler";

vi.mock("server-only", () => ({}));

/** Landing taste voice (founder decision 21 Nov): its own pool of at most 5,000 characters a day, plus the per-address bucket. */
const pcm = () => new Response(new Uint8Array([1, 0, 2, 0]), { status: 200 });
const make = (extra: Record<string, string> = {}, fetchImpl = vi.fn(async () => pcm())) =>
  ({ d: makeElevenDeps({ env: readElevenEnv({ ELEVENLABS_API_KEY: "k", ...extra }), brainEnv: readEnv({}), fetchImpl: fetchImpl as unknown as typeof fetch }), fetchImpl });
const line = "x".repeat(250);
const post = (ip: string, headers: Record<string, string> = { "x-gleeful-voice": "landing" }, text = line) =>
  new Request("http://localhost/api/voice", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip, ...headers }, body: JSON.stringify({ text, teacher: "leo" }) });

describe("landing voice budget", () => {
  it("is at most 5,000 characters a day across ALL landing visitors (many addresses cannot raise it)", async () => {
    const { d, fetchImpl } = make();
    let ok = 0;
    for (let i = 0; i < 40; i++) if ((await handleVoice(post(`10.0.${i}.1`), d)).status === 200) ok++;
    expect(ok * line.length).toBeLessThanOrEqual(5_000);
    expect(ok).toBe(20);
    expect(fetchImpl).toHaveBeenCalledTimes(20);
    expect((await handleVoice(post("10.9.9.9"), d)).status).toBe(429);
  });
  it("env can lower the pool but never raise it above 5,000", () => {
    expect(readElevenEnv({ ELEVEN_LANDING_DAILY_CHARS: "999999" }).landingDailyChars).toBe(5_000);
    expect(readElevenEnv({ ELEVEN_LANDING_DAILY_CHARS: "1000" }).landingDailyChars).toBe(1_000);
    expect(readElevenEnv({ ELEVEN_LANDING_DAILY_CHARS: "junk" }).landingDailyChars).toBe(5_000);
    expect(ELEVEN_LIMITS.landingDailyCharsMax).toBe(5_000);
  });
  it("one address still has its own daily bucket inside the pool", async () => {
    const { d } = make({ ELEVEN_ANON_IP_CHARS: "500" });
    expect((await handleVoice(post("10.1.1.1"), d)).status).toBe(200);
    expect((await handleVoice(post("10.1.1.1"), d)).status).toBe(200);
    expect((await handleVoice(post("10.1.1.1"), d)).status).toBe(429);
    expect((await handleVoice(post("10.1.1.2"), d)).status).toBe(200);
  });
  it("is separate from the ELEVEN_PUBLIC pool (one cannot drain the other)", async () => {
    const { d } = make({ ELEVEN_PUBLIC: "on", ELEVEN_LANDING_DAILY_CHARS: "500", ELEVEN_ANON_POOL_CHARS: "500" });
    expect((await handleVoice(post("10.2.0.1"), d)).status).toBe(200);
    expect((await handleVoice(post("10.2.0.2"), d)).status).toBe(200);
    expect((await handleVoice(post("10.2.0.3"), d)).status).toBe(429); // landing pool used up
    expect((await handleVoice(post("10.2.0.4", { "x-gleeful-voice": "public" }), d)).status).toBe(200); // public pool untouched
  });
  it("refunds a clean upstream refusal, so a failing vendor does not eat the pool", async () => {
    const { d } = make({ ELEVEN_LANDING_DAILY_CHARS: "500" }, vi.fn(async () => new Response("no", { status: 401 })));
    for (let i = 0; i < 5; i++) expect((await handleVoice(post(`10.3.0.${i}`), d)).status).toBe(502);
    expect(d.anon.get("landing-pool")?.chars).toBe(0);
  });
  it("ELEVEN_LANDING=off, no key, or the kill switch: refused before any call", async () => {
    const off = make({ ELEVEN_LANDING: "off" });
    expect((await handleVoice(post("10.4.0.1"), off.d)).status).toBe(503);
    const nokey = makeElevenDeps({ env: readElevenEnv({}), brainEnv: readEnv({}) });
    expect((await handleVoice(post("10.4.0.2"), nokey)).status).toBe(503);
    const killed = make({ TTS_DISABLED: "1" });
    expect((await handleVoice(post("10.4.0.3"), killed.d)).status).toBe(503);
    expect(off.fetchImpl).not.toHaveBeenCalled(); expect(killed.fetchImpl).not.toHaveBeenCalled();
  });
  it("the browser still cannot pick the voice, model or text length; text over 300 is refused", async () => {
    const { d, fetchImpl } = make();
    expect((await handleVoice(post("10.5.0.1", undefined, "y".repeat(301)), d)).status).toBe(400);
    const r = new Request("http://localhost/api/voice", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.5.0.2", "x-gleeful-voice": "landing" }, body: JSON.stringify({ text: "hi", teacher: "bob" }) });
    expect((await handleVoice(r, d)).status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("status reports landing (a boolean) and no secrets", async () => {
    const { d } = make();
    const s = await voiceStatus(new Request("http://localhost/api/voice"), d);
    expect(s.body).toMatchObject({ configured: true, landing: true, public: false });
    expect(JSON.stringify(s.body)).not.toContain("\"k\"");
  });
});

describe("landing voice in the browser: silent fallback to the free voice", () => {
  afterEach(() => { vi.resetModules(); vi.unstubAllGlobals(); vi.doUnmock("@/lib/voice/elevenSpeak"); });
  it("uses the landing pool only after the server says so, and never after a refusal", async () => {
    const m = await import("@/lib/voice/elevenSpeak");
    m.resetEleven();
    const f = vi.fn(async () => Response.json({ configured: true, landing: true, public: false }));
    await m.probeVoice(f as unknown as typeof fetch);
    expect(m.elevenLandingAvailable()).toBe("landing");
    expect(m.elevenAvailable()).toBeNull(); // the lesson's public gate stays off
    m.disableEleven();
    expect(m.elevenLandingAvailable()).toBeNull();
    m.resetEleven();
    await m.probeVoice(vi.fn(async () => Response.json({ configured: true, landing: false })) as unknown as typeof fetch);
    expect(m.elevenLandingAvailable()).toBeNull();
  });
  it("an ElevenLabs failure hands the line to the browser voice", async () => {
    vi.doMock("@/lib/voice/elevenSpeak", () => ({
      elevenLandingAvailable: () => "landing",
      speakElevenLine: (_t: string, _te: string, _c: string, cb: { onFail: (s: boolean, rest: string) => void }) => { queueMicrotask(() => cb.onFail(false, "Hello from Leo.")); return { stop() {} }; },
    }));
    const spoken: string[] = [];
    class U { text: string; onstart?: () => void; onend?: () => void; onerror?: () => void; onboundary?: () => void; voice: unknown; pitch = 1; rate = 1; lang = ""; constructor(t: string) { this.text = t; } }
    vi.stubGlobal("SpeechSynthesisUtterance", U);
    vi.stubGlobal("window", { speechSynthesis: { getVoices: () => [{ name: "x", lang: "en-US", voiceURI: "x", localService: true }], cancel() {}, speak(u: U) { spoken.push(u.text); u.onstart?.(); u.onend?.(); }, addEventListener() {} } });
    const { speakTaste } = await import("@/lib/voice/tasteSpeak");
    const ev = { onStart: vi.fn(), onEnd: vi.fn() };
    speakTaste("Hello from Leo.", "leo", ev);
    await new Promise((r) => setTimeout(r, 20));
    expect(spoken).toEqual(["Hello from Leo."]);
    expect(ev.onStart).toHaveBeenCalledTimes(1);
    expect(ev.onEnd).toHaveBeenCalledWith(true);
  });
  it("no speech synthesis and no pool: onEnd runs AFTER speakTaste returns, so a callback may read the returned handle", async () => {
    vi.doMock("@/lib/voice/elevenSpeak", () => ({ elevenLandingAvailable: () => null, speakElevenLine: vi.fn() }));
    const { speakTaste } = await import("@/lib/voice/tasteSpeak");
    let seen: unknown = "unset";
    const v: { stop(): void } = speakTaste("Hi.", "leo", { onStart: () => {}, onEnd: () => { seen = v; } }); // `v` is in its temporal dead zone if onEnd ran synchronously
    expect(seen).toBe("unset");
    await new Promise((r) => setTimeout(r, 5));
    expect(seen).toBe(v);
  });
  it("browserOnly never asks for ElevenLabs (a fixed line spends no pool characters)", async () => {
    const speakElevenLine = vi.fn();
    const avail = vi.fn(() => "landing");
    vi.doMock("@/lib/voice/elevenSpeak", () => ({ elevenLandingAvailable: avail, speakElevenLine }));
    const { speakTaste } = await import("@/lib/voice/tasteSpeak");
    speakTaste("Hi.", "mia", { onStart: () => {}, onEnd: () => {} }, { browserOnly: true });
    await new Promise((r) => setTimeout(r, 5));
    expect(speakElevenLine).not.toHaveBeenCalled();
    expect(avail).not.toHaveBeenCalled();
  });
  it("no voice at all: ends quietly without pretending to speak", async () => {
    vi.doMock("@/lib/voice/elevenSpeak", () => ({ elevenLandingAvailable: () => null, speakElevenLine: vi.fn() }));
    const { speakTaste, tasteLevel } = await import("@/lib/voice/tasteSpeak");
    const ev = { onStart: vi.fn(), onEnd: vi.fn() };
    speakTaste("Hi.", "mia", ev);
    await new Promise((r) => setTimeout(r, 5));
    expect(ev.onStart).not.toHaveBeenCalled();
    expect(ev.onEnd).toHaveBeenCalledWith(false);
    expect(tasteLevel()).toBe(0);
  });
});
