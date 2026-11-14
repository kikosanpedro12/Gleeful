import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { listenOnce } from "@/lib/voice/speech";

/** A fake browser SpeechRecognition we can drive by hand. */
class FakeSR {
  static last: FakeSR;
  lang = ""; interimResults = false; continuous = false; maxAlternatives = 1;
  onresult: any = null; onerror: any = null; onend: any = null; onstart: any = null; onspeechstart: any = null; onspeechend: any = null;
  stopped = false; aborted = false;
  constructor() { FakeSR.last = this; }
  start() { this.onstart?.(); }
  stop() { this.stopped = true; }
  abort() { this.aborted = true; }
  interim(text: string) { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: false })] }); }
  final(text: string) { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] }); }
}

const handlers = () => {
  const got: string[] = []; const nothing: string[] = [];
  return { got, nothing, h: { onStart() {}, onInterim() {}, onFinal: (t: string) => got.push(t), onNothing: (r: string) => nothing.push(r) } };
};

describe("tap-to-talk keeps what the child said", () => {
  beforeEach(() => { (globalThis as any).window = { SpeechRecognition: FakeSR }; });
  afterEach(() => { delete (globalThis as any).window; });

  it("stop() asks the recogniser to finish, not abort", () => {
    const { h } = handlers();
    const l = listenOnce(h as any);
    l.stop();
    expect(FakeSR.last.stopped).toBe(true);
    expect(FakeSR.last.aborted).toBe(false);
  });

  it("if the browser ends with only interim text, that text is delivered (Android Chrome)", () => {
    const { h, got, nothing } = handlers();
    listenOnce(h as any);
    FakeSR.last.interim("why is mars red");
    FakeSR.last.onend();
    expect(got).toEqual(["why is mars red"]);
    expect(nothing).toEqual([]);
  });

  it("silence still reports no-speech", () => {
    const { h, got, nothing } = handlers();
    listenOnce(h as any);
    FakeSR.last.onend();
    expect(got).toEqual([]);
    expect(nothing).toEqual(["no-speech"]);
  });

  it("cancel throws the audio away and delivers nothing", () => {
    const { h, got } = handlers();
    const l = listenOnce(h as any);
    FakeSR.last.interim("hello");
    l();
    FakeSR.last.onend();
    expect(FakeSR.last.aborted).toBe(true);
    expect(got).toEqual([]);
  });
});
