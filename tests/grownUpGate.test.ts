import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { GATE_KEY, decide, readGate, voiceAllowed, writeGate, type GateStore } from "@/lib/taste/grownUp";

const mem = (init: Record<string, string> = {}): GateStore & { m: Map<string, string> } => {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};
const throwing: GateStore = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); } };

describe("grown-up gate state", () => {
  it("is closed by default and voice is not allowed", () => {
    expect(readGate(mem())).toBe("closed");
    expect(readGate(null)).toBe("closed");
    expect(voiceAllowed("closed")).toBe(false);
  });
  it("accept opens, decline stays silent", () => {
    expect(decide(true)).toBe("open"); expect(voiceAllowed(decide(true))).toBe(true);
    expect(decide(false)).toBe("declined"); expect(voiceAllowed(decide(false))).toBe(false);
  });
  it("round-trips through sessionStorage", () => {
    const s = mem(); writeGate("open", s); expect(readGate(s)).toBe("open");
    writeGate("declined", s); expect(readGate(s)).toBe("declined");
  });
  it("a storage failure is safe: reads closed, writes do not throw", () => {
    expect(readGate(throwing)).toBe("closed");
    expect(() => writeGate("open", throwing)).not.toThrow();
  });
  it("a hostile or odd stored value is ignored (closed)", () => {
    for (const v of ["", "YES", "true", "1", "open", "yes ", "<script>", "__proto__", "x".repeat(10000), "{\"a\":1}"]) expect(readGate(mem({ [GATE_KEY]: v })), v.slice(0, 12)).toBe("closed");
  });
  it("never writes 'closed'", () => { const s = mem(); writeGate("closed", s); expect(s.m.size).toBe(0); });
});

const code = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const hero = readFileSync("src/components/landing/ClassroomHero.tsx", "utf8");
const gateSrc = code("src/lib/taste/grownUp.ts");
const heroCode = code("src/components/landing/ClassroomHero.tsx");
function fnBody(name: string): string {
  const start = hero.indexOf(`function ${name}(`);
  expect(start, `${name} exists`).toBeGreaterThan(-1);
  const open = hero.indexOf("{", hero.indexOf(")", start));
  let depth = 0;
  for (let i = open; i < hero.length; i++) { if (hero[i] === "{") depth++; else if (hero[i] === "}" && --depth === 0) return hero.slice(open, i + 1); }
  throw new Error("unbalanced");
}

describe("source guards: nothing voice-related before the grown-up says yes", () => {
  it("storage is sessionStorage only: no localStorage, no cookie, no fetch in the gate module", () => {
    expect(gateSrc).toContain("sessionStorage");
    expect(gateSrc).not.toMatch(/localStorage|document\.cookie|fetch\(|XMLHttpRequest|sendBeacon/);
  });
  it("the mic path checks the gate before listenOnce", () => {
    const b = fnBody("talk");
    expect(b.indexOf("voiceAllowed(gateRef.current)")).toBeGreaterThan(-1);
    expect(b.indexOf("voiceAllowed(gateRef.current)")).toBeLessThan(b.indexOf("listenOnce("));
  });
  it("say() (the only speaker, the opener included) checks the gate first", () => {
    const b = fnBody("say");
    expect(b.indexOf("voiceAllowed(gateRef.current)")).toBeGreaterThan(-1);
    expect(b.indexOf("voiceAllowed(gateRef.current)")).toBeLessThan(b.indexOf("speakTaste("));
  });
  it("every other voice entry point is behind the gate", () => {
    expect(hero).toMatch(/voiceAllowed\(gateRef\.current\) && elevenLandingAvailable\(\)\) primeAudio\(\)/); // elevenLandingAvailable() would start the probe
    const calls = [...hero.matchAll(/\b(probeVoice|primeAudio|elevenLandingAvailable|listenOnce|speakTaste)\(/g)].map((m) => m[1]);
    expect(calls.sort()).toEqual(["elevenLandingAvailable", "listenOnce", "primeAudio", "probeVoice", "probeVoice", "speakTaste"]);
    // the two probeVoice calls: on mount only when an earlier yes is remembered, and in answerGate(true)
    expect(hero).toContain("if (voiceAllowed(earlier)) void probeVoice()");
    expect(fnBody("answerGate")).toContain("if (accepted) { void probeVoice()");
    expect(hero).not.toMatch(/useEffect\(\(\) => \{[\s\S]{0,400}\n\s+void probeVoice\(\);/);
  });
  it("no direct getUserMedia / SpeechRecognition / speechSynthesis / api/voice in the hero", () => {
    expect(heroCode).not.toMatch(/getUserMedia|new (webkit)?SpeechRecognition|speechSynthesis|\/api\/voice/);
  });
  it("Mute voice renders only when voice is on; the gate card has two equal buttons", () => {
    expect(hero).toMatch(/const voiceRow = on && /);
    const yes = hero.match(/<button[^\n]*data-testid="gate-yes"/)?.[0] ?? "";
    const no = hero.match(/<button[^\n]*data-testid="gate-no"/)?.[0] ?? "";
    expect(yes).toContain("lp-btn lp-btn-main"); expect(no).toContain("lp-btn lp-btn-main");
    expect(hero).toContain("light check, not age verification");
    expect(hero).toMatch(/Google, Microsoft or Apple/);
  });
  it("the gate never takes focus on its own: only a tap on the mic or voice button opens it", () => {
    expect(fnBody("askGate")).toContain("setAsking(true)");
    expect([...hero.matchAll(/askGate\(\)/g)].length).toBe(2); // in talk() and the voice button
  });
});
