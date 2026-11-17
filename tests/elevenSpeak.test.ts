import { describe, expect, it, vi } from "vitest";
import { chunkDeadlineMs, chunkText, disableEleven, elevenAvailable, resetEleven, speakElevenLine } from "@/lib/voice/elevenSpeak";

describe("chunkText", () => {
  it("keeps a short line whole", () => expect(chunkText("Hello! Where should we go today?")).toEqual(["Hello! Where should we go today?"]));
  it("splits at sentence ends into pieces of at most 300 characters and loses no words", () => {
    const text = Array.from({ length: 12 }, (_, i) => `This is sentence number ${i + 1} of the long lesson line.`).join(" ");
    const parts = chunkText(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(300);
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(text);
  });
  it("splits one over-long sentence at spaces", () => {
    const text = "word ".repeat(200).trim() + ".";
    const parts = chunkText(text);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(300);
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(text);
  });
  it("returns nothing for blank text", () => expect(chunkText("  \n ")).toEqual([]));
});

describe("lesson voice gating", () => {
  it("is unavailable without a passcode, and after the first failure", () => {
    resetEleven();
    expect(elevenAvailable()).toBeNull(); // no sessionStorage in this environment
    vi.stubGlobal("sessionStorage", { getItem: () => "a-long-private-test-code-1234" });
    expect(elevenAvailable()).toBe("a-long-private-test-code-1234");
    disableEleven();
    expect(elevenAvailable()).toBeNull();
    resetEleven();
    vi.unstubAllGlobals();
  });
  it("a refusal switches ElevenLabs off and reports nothing spoken", async () => {
    resetEleven();
    class Ctx { state = "running"; currentTime = 0; destination = {}; resume() { return Promise.resolve(); } }
    vi.stubGlobal("window", { AudioContext: Ctx });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    const onFail = vi.fn(), onEnd = vi.fn(), onFirstSound = vi.fn();
    speakElevenLine("Hi there.", "leo", "code", { onFirstSound, onEnd, onFail });
    await vi.waitFor(() => expect(onFail).toHaveBeenCalledWith(false, "Hi there."));
    expect(onEnd).not.toHaveBeenCalled();
    vi.stubGlobal("sessionStorage", { getItem: () => "code" });
    expect(elevenAvailable()).toBeNull();
    resetEleven();
    vi.unstubAllGlobals();
  });
  it("a rate limit (429) falls back for this line only and does not switch ElevenLabs off", async () => {
    resetEleven();
    class Ctx { state = "running"; currentTime = 0; destination = {}; resume() { return Promise.resolve(); } }
    vi.stubGlobal("window", { AudioContext: Ctx });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    const onFail = vi.fn();
    speakElevenLine("Hi there.", "mia", "code", { onFirstSound: vi.fn(), onEnd: vi.fn(), onFail });
    await vi.waitFor(() => expect(onFail).toHaveBeenCalled());
    vi.stubGlobal("sessionStorage", { getItem: () => "code" });
    expect(elevenAvailable()).toBe("code");
    resetEleven();
    vi.unstubAllGlobals();
  });
  it("a stalled chunk ends past its deadline instead of hanging", async () => {
    resetEleven();
    vi.useFakeTimers();
    class Ctx { state = "running"; currentTime = 0; destination = {}; resume() { return Promise.resolve(); } }
    vi.stubGlobal("window", { AudioContext: Ctx });
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {}))); // never answers
    const onFail = vi.fn();
    speakElevenLine("Hi there.", "leo", "code", { onFirstSound: vi.fn(), onEnd: vi.fn(), onFail });
    await vi.advanceTimersByTimeAsync(chunkDeadlineMs("Hi there.") + 10);
    expect(onFail).toHaveBeenCalledWith(false, "Hi there.");
    vi.useRealTimers();
    resetEleven();
    vi.unstubAllGlobals();
  });
});
