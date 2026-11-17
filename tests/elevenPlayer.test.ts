import { describe, expect, it, vi } from "vitest";

describe("check-secrets", () => {
  it("flags a public-prefixed ElevenLabs key", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("scripts/check-secrets.mjs", "utf8");
    const m = src.match(/const PUBLIC_SECRET = (\/.*\/);/)!;
    const re = eval(m[1]) as RegExp; // eslint-disable-line no-eval
    expect(re.test("NEXT_PUBLIC_" + "ELEVENLABS_API_KEY")).toBe(true);
    expect(re.test("NEXT_PUBLIC_" + "ELEVEN_VOICE")).toBe(true);
  });
});

describe("speakEleven stop", () => {
  it("done settles when stop() runs during the final playback wait", async () => {
    const sources: { onended: (() => void) | null; start: () => void; stop: () => void; connect: () => void; buffer: unknown }[] = [];
    class FakeCtx {
      state = "running"; currentTime = 0; destination = {};
      resume() { return Promise.resolve(); }
      createBuffer(_c: number, n: number, r: number) { return { duration: n / r, copyToChannel() {} }; }
      createBufferSource() { const s = { onended: null, start() {}, stop() {}, connect() {}, buffer: null }; sources.push(s); return s; }
    }
    vi.stubGlobal("window", { AudioContext: FakeCtx });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 0, 2, 0]), { status: 200, headers: { "x-sample-rate": "24000" } })));
    const { speakEleven } = await import("@/lib/voice/elevenPlayer");
    let firstMs: number | null = null;
    const pb = speakEleven("hi", "leo", "code", (ms) => { firstMs = ms; });
    await vi.waitFor(() => expect(sources.length).toBe(1));
    await new Promise((r) => setTimeout(r, 10)); // now parked on the last source's onended
    pb.stop();
    const res = await Promise.race([pb.done, new Promise((r) => setTimeout(() => r("hung"), 500))]);
    expect(res).not.toBe("hung");
    expect(firstMs).not.toBeNull();
    vi.unstubAllGlobals();
  });
  it("reports no first-sound time when the audio context is suspended", async () => {
    class Susp { state = "suspended"; currentTime = 0; destination = {}; resume() { return Promise.resolve(); } createBuffer() { return { duration: 0.1, copyToChannel() {} }; } createBufferSource() { return { start() {}, stop() {}, connect() {}, onended: null as null | (() => void) }; } }
    vi.stubGlobal("window", { AudioContext: Susp });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 0, 2, 0]), { status: 200 })));
    vi.resetModules();
    const { speakEleven } = await import("@/lib/voice/elevenPlayer");
    const pb = speakEleven("hi", "mia", "code");
    await new Promise((r) => setTimeout(r, 20));
    pb.stop();
    const res = await pb.done;
    expect(res.timing.firstSoundMs).toBeNull();
    vi.unstubAllGlobals();
  });
});
