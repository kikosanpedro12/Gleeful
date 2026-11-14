import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { ENGINES, LINES, shuffled, summary, tally } from "@/lib/voicelab/lines";

describe("voice lab", () => {
  it("every Kokoro clip the page can ask for exists, for both teachers", () => {
    for (const t of ["leo", "mia"] as const) for (const e of ENGINES) for (let i = 0; i < LINES.length; i++) {
      const url = e.clip(t, i);
      if (url) expect(existsSync(`public${url}`), url).toBe(true);
    }
  });
  it("the built-in voice has no clip (it speaks live)", () => {
    expect(ENGINES.find((e) => e.id === "browser")!.clip("leo", 0)).toBeNull();
  });
  it("shuffling is a permutation and varies with the random source", () => {
    const ids = ENGINES.map((e) => e.id);
    let n = 0;
    const a = shuffled(ids, () => (n = (n + 0.37) % 1));
    expect([...a].sort()).toEqual([...ids].sort());
    expect(shuffled(ids, () => 0.99)).toEqual(ids);
    expect(shuffled(ids, () => 0)).not.toEqual(ids);
  });
  it("tallies ratings per engine and counts what is unrated", () => {
    const r = [{ browser: "robotic", "kokoro-a": "great", "kokoro-b": "ok" }, { browser: "robotic", "kokoro-a": "great" }, {}, {}, {}] as never;
    const t = tally(r);
    expect(t.browser).toEqual({ great: 0, ok: 0, robotic: 2, unrated: 3 });
    expect(t["kokoro-a"]).toEqual({ great: 2, ok: 0, robotic: 0, unrated: 3 });
    expect(t["kokoro-b"].ok).toBe(1);
    expect(summary("leo", t)).toMatch(/Leo/);
  });
  it("the page is private: noindex and disallowed", async () => {
    const { isPrivatePath } = await import("@/lib/seo/site");
    expect(isPrivatePath("/voice-lab")).toBe(true);
    expect(isPrivatePath("/voice-lab/leo-a-1.mp3")).toBe(true);
  });
});
