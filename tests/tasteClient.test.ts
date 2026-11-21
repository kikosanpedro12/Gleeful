import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { askTaste } from "@/lib/taste/client";
import type { TasteRequest } from "@/lib/taste/protocol";
import { openerLine, STARTERS, tapChips } from "@/components/landing/tasteCopy";

const body: TasteRequest = { v: 1, tasteId: "taste_client_01", text: "why?", teacher: "leo", history: [] };
const ok = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status });
const later = <T,>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms));

describe("askTaste: the visitor leaves while the answer is pending", () => {
  it("a reply that arrives after unmount is reported as aborted (nothing to speak, act or time)", async () => {
    let alive = true;
    const f = vi.fn(() => later(20, ok({ reply: "Hello.", turnsLeft: 2, act: "jump" })));
    const p = askTaste(body, { signal: new AbortController().signal, alive: () => alive, fetchImpl: f as unknown as typeof fetch });
    alive = false; // unmount while the POST is in flight
    expect(await p).toEqual({ kind: "aborted" });
  });
  it("also when the page leaves between the headers and the body", async () => {
    let alive = true;
    const res = { ok: true, status: 200, json: async () => { alive = false; return { reply: "Hi.", turnsLeft: 1 }; } } as unknown as Response;
    expect(await askTaste(body, { signal: new AbortController().signal, alive: () => alive, fetchImpl: (async () => res) as unknown as typeof fetch })).toEqual({ kind: "aborted" });
  });
  it("an aborted request (pagehide / unmount abort) is aborted, not 'trouble'", async () => {
    const ctl = new AbortController();
    const f = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")))));
    const p = askTaste(body, { signal: ctl.signal, alive: () => true, fetchImpl: f as unknown as typeof fetch });
    ctl.abort();
    expect(await p).toEqual({ kind: "aborted" });
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBe(ctl.signal);
  });
  it("a 429 body read after unmount is aborted too", async () => {
    let alive = true;
    const res = { ok: false, status: 429, json: async () => { alive = false; return { error: "taste_over" }; } } as unknown as Response;
    expect(await askTaste(body, { signal: new AbortController().signal, alive: () => alive, fetchImpl: (async () => res) as unknown as typeof fetch })).toEqual({ kind: "aborted" });
  });
});

describe("askTaste: results for a visitor who stays", () => {
  const run = (res: Response | Error) => askTaste(body, { signal: new AbortController().signal, alive: () => true, fetchImpl: (async () => { if (res instanceof Error) throw res; return res; }) as unknown as typeof fetch });
  it("reply: clamps turnsLeft and carries the optional fields untouched for the component to re-validate", async () => {
    const r = await run(ok({ reply: "Hi.", turnsLeft: 99, choices: ["A", "B"], topic: "frogs" }));
    expect(r).toMatchObject({ kind: "reply", reply: { reply: "Hi.", left: 3, choices: ["A", "B"], topic: "frogs" } });
    expect(await run(ok({ reply: "Hi.", turnsLeft: "x" }))).toMatchObject({ kind: "reply", reply: { left: 0 } });
  });
  it("maps statuses", async () => {
    expect(await run(ok({ error: "taste_over" }, 429))).toEqual({ kind: "over" });
    expect(await run(ok({ error: "rate_limited" }, 429))).toEqual({ kind: "rate_limited" });
    expect(await run(ok({ error: "taste_busy" }, 503))).toEqual({ kind: "busy" });
    expect(await run(ok({}, 502))).toEqual({ kind: "trouble" });
    expect(await run(ok({ reply: "" }))).toEqual({ kind: "trouble" });
    expect(await run(ok({ reply: 5 }))).toEqual({ kind: "trouble" });
    expect(await run(new Error("offline"))).toEqual({ kind: "trouble" });
  });
});

describe("ClassroomHero wiring", () => {
  const src = fs.readFileSync("src/components/landing/ClassroomHero.tsx", "utf8");
  it("aborts the POST and stops speech on unmount and pagehide, and checks alive after the await", () => {
    expect(src).toMatch(/alive\.current = false;/);
    expect(src).toMatch(/postCtl\.current\?\.abort\(\)/);
    expect(src).toMatch(/addEventListener\("pagehide", leave\)/);
    expect(src).toMatch(/if \(!alive\.current \|\| r\.kind === "aborted"\) return;/);
    expect(src).toMatch(/if \(!alive\.current\) return;\s*\n\s*if \(mutedRef\.current\)/); // say() never starts speech for a gone page
  });
  it("blocks a second send in the same tick (busyRef) and clears the busy note on success", () => {
    expect(src).toMatch(/busyRef\.current \|\| busy/);
    expect(src).toMatch(/busyRef\.current = true;/);
    expect(src).toMatch(/if \(busyRef\.current\) return; \/\/ a chip was tapped/);
    expect(src).toMatch(/setText\(""\); setBusyNote\(false\);/);
  });
  it("the opener is fixed text, browser voice only, a wave, and not a model call or a try", () => {
    expect(src).toMatch(/say\(openerLine\(t === "mia" \? "Mia" : "Leo"\), t, true\)/);
    expect(src).toMatch(/session\.tasteActs\(\{ gesture: "wave" \}\)/);
    expect(src).toMatch(/\{ browserOnly \}/);
    const pick = src.slice(src.indexOf("function pick("), src.indexOf("/** Silence the tutor"));
    expect(pick).not.toMatch(/fetch|askTaste|setUsed|setLines/);
  });
});

describe("opener copy", () => {
  it("offers exactly the two starter questions, as words and as the tap choices", () => {
    const line = openerLine("Leo");
    expect(line).toBe("Hi, I'm Leo! Want to find out why Mars is red, or how old the pyramids are?");
    expect(STARTERS.map((s) => s.ask)).toEqual(["Why is Mars red?", "How old are the pyramids?"]);
    expect(tapChips({ used: 0, asked: 0, choices: [], ideas: STARTERS.map((s) => s.ask) }).items).toHaveLength(2);
    expect(line.length).toBeLessThan(120); // short enough to speak
    expect(line).not.toMatch(/\bAI\b/); // fixed script: claims nothing the card does not already say
  });
});
