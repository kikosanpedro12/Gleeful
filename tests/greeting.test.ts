import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { playRecorded } from "@/lib/voice/tasteSpeak";
import { GREETING_AUDIO, PLACEHOLDERS, greetingLine } from "@/lib/voice/greeting";

class FakeAudio {
  static last: FakeAudio;
  onplaying: (() => void) | null = null; onended: (() => void) | null = null; onerror: (() => void) | null = null;
  paused = false; reject = false;
  constructor(public src: string) { FakeAudio.last = this; }
  play() { return this.reject ? Promise.reject(new Error("blocked")) : Promise.resolve(); }
  pause() { this.paused = true; }
}
beforeEach(() => { vi.useFakeTimers(); (globalThis as unknown as { Audio: unknown }).Audio = FakeAudio; });
afterEach(() => { vi.useRealTimers(); delete (globalThis as unknown as { Audio?: unknown }).Audio; });

describe("recorded greeting", () => {
  it("starts only when sound really plays, then ends with spoke=true", () => {
    const ev = { onStart: vi.fn(), onEnd: vi.fn() };
    playRecorded("/audio/x.mp3", ev);
    expect(ev.onStart).not.toHaveBeenCalled();
    FakeAudio.last.onplaying?.(); FakeAudio.last.onended?.();
    expect(ev.onStart).toHaveBeenCalledTimes(1);
    expect(ev.onEnd).toHaveBeenCalledWith(true);
  });
  it("stop() is silent: no callback after it", () => {
    const ev = { onStart: vi.fn(), onEnd: vi.fn() };
    const v = playRecorded("/audio/x.mp3", ev);
    v.stop();
    FakeAudio.last.onplaying?.(); FakeAudio.last.onended?.();
    expect(ev.onStart).not.toHaveBeenCalled(); expect(ev.onEnd).not.toHaveBeenCalled();
    expect(FakeAudio.last.paused).toBe(true);
  });
  it("a blocked or missing file ends with spoke=false (the caption stays, nothing is faked)", async () => {
    const ev = { onStart: vi.fn(), onEnd: vi.fn() };
    playRecorded("/audio/x.mp3", ev); FakeAudio.last.onerror?.();
    expect(ev.onEnd).toHaveBeenCalledWith(false);
    const ev2 = { onStart: vi.fn(), onEnd: vi.fn() };
    playRecorded("/audio/y.mp3", ev2); vi.advanceTimersByTime(4100);
    expect(ev2.onEnd).toHaveBeenCalledWith(false); expect(ev2.onStart).not.toHaveBeenCalled();
  });
});

describe("greeting copy and files", () => {
  it("greets by name and asks one open question", () => {
    expect(greetingLine("Leo")).toBe("Hi, I'm Leo! What do you want to learn today?");
  });
  it("a configured recorded file must exist under public/ and be same-origin (CSP media-src 'self')", () => {
    for (const src of Object.values(GREETING_AUDIO)) if (src) { expect(src.startsWith("/")).toBe(true); expect(fs.existsSync(`public${src}`)).toBe(true); }
  });
  it("placeholders stay short and never promise more than the demo does", () => {
    expect(PLACEHOLDERS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(PLACEHOLDERS).size).toBe(PLACEHOLDERS.length);
    for (const p of PLACEHOLDERS) { expect(p.length).toBeLessThanOrEqual(40); expect(p).toMatch(/\?$|^Quiz me on /); expect(p).not.toMatch(/\banything\b|\bexam\b|\ball\b/i); }
  });
});
