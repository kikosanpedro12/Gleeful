/**
 * Live eval (OFF by default). Run with `npm run evals -- --live`. Sends each case's `prompt` to the real model
 * (MODELS.default) and applies the same checks to the real answer. Real spend: refuses to run without
 * ANTHROPIC_API_KEY, and stops at EVAL_MAX_CALLS (default 20, allowed 1-200). Under plain `npm test` it is skipped.
 * Only the fixed eval prompts are sent: no child data exists here.
 */
import { describe, expect, it } from "vitest";
import { callAnthropic } from "@/lib/brain/server/anthropic";
import { MODELS } from "@/lib/brain/server/config";
import { TASTE_SYSTEM, buildTasteUser } from "@/lib/taste/server/prompt";
import { TASTE_LIMITS } from "@/lib/taste/server/config";
import { buildSystem, buildUserMessage } from "@/lib/brain/server/prompt";
import { toolsFor } from "@/lib/scene/commands";
import { contextFor } from "@/lib/worlds/registry";
import { allProblems, runPipeline } from "./core";
import { CASES } from "./run";
import type { BrainRequest } from "@/lib/brain/protocol";

export const DEFAULT_MAX_CALLS = 20;
export const HARD_MAX_CALLS = 200;

/** Returns the cap, or throws with the reason the run must be refused. Exported for the CLI and tests. */
export function liveGuard(env: Record<string, string | undefined>): number {
  if (!env.ANTHROPIC_API_KEY) throw new Error("refusing to run live: ANTHROPIC_API_KEY is not set");
  const raw = env.EVAL_MAX_CALLS;
  if (raw === undefined || raw === "") return DEFAULT_MAX_CALLS;
  if (!/^\d+$/.test(raw)) throw new Error(`refusing to run live: EVAL_MAX_CALLS must be a whole number (got "${raw.slice(0, 20)}")`);
  const n = Number(raw);
  if (n < 1 || n > HARD_MAX_CALLS) throw new Error(`refusing to run live: EVAL_MAX_CALLS must be 1 to ${HARD_MAX_CALLS}`);
  return n;
}

const LIVE = process.env.EVAL_LIVE === "1";

describe.skipIf(!LIVE)("evals (LIVE, real model, capped spend)", () => {
  it("runs the cases", async () => {
    const cap = liveGuard(process.env);
    const apiKey = process.env.ANTHROPIC_API_KEY as string;
    let calls = 0, pass = 0, fail = 0;
    const failures: string[] = [];
    console.log(`\nLIVE eval: model ${MODELS.default}, cap ${cap} calls`);
    for (const c of CASES) {
      if (calls >= cap) { console.log(`  cap reached after ${calls} calls; remaining cases skipped`); break; }
      const surface = (c.surfaces ?? ["taste"])[0];
      calls++;
      let content: unknown;
      try {
        if (surface === "taste") {
          const up = await callAnthropic({ fetchImpl: fetch, apiKey, model: MODELS.default, system: TASTE_SYSTEM, user: buildTasteUser({ v: 1, tasteId: "eval_live_0001", text: c.prompt, teacher: "leo", history: [] }), maxTokens: TASTE_LIMITS.maxOutputTokens });
          content = up.content;
        } else {
          const world = c.world ?? "mars";
          const req: BrainRequest = { v: 1, learnerId: "eval", sessionId: "eval", tz: "Asia/Manila", world, teacher: "leo", session: 1, input: c.input ?? { kind: "text", text: c.prompt }, hintsUsed: 0, history: [], skills: [] };
          const up = await callAnthropic({ fetchImpl: fetch, apiKey, model: MODELS.default, system: buildSystem(req), user: buildUserMessage(req), tools: toolsFor(contextFor(world)) });
          content = up.content;
        }
      } catch (e) {
        fail++; failures.push(`${c.id}: call failed (${(e as Error).message})`); continue;
      }
      const p = runPipeline(surface, content as unknown[], { world: c.world, input: c.input });
      const problems = allProblems(c, surface, p);
      if (problems.length) { fail++; failures.push(`${c.id}: ${problems.join("; ")}\n      reply: ${p.text ?? "(none)"}`); } else pass++;
    }
    console.log(`LIVE result: ${pass} pass, ${fail} fail, ${calls} calls`);
    for (const f of failures) console.log("  FAIL " + f);
    expect(failures).toEqual([]);
  }, 600_000);
});

describe("live guard (no network)", () => {
  it("refuses without a key", () => expect(() => liveGuard({})).toThrow(/ANTHROPIC_API_KEY/));
  it("defaults the cap to 20", () => expect(liveGuard({ ANTHROPIC_API_KEY: "k" })).toBe(20));
  it("honours an explicit cap and rejects bad ones", () => {
    expect(liveGuard({ ANTHROPIC_API_KEY: "k", EVAL_MAX_CALLS: "5" })).toBe(5);
    for (const bad of ["0", "-1", "abc", "1e3", "201", "5.5"]) expect(() => liveGuard({ ANTHROPIC_API_KEY: "k", EVAL_MAX_CALLS: bad })).toThrow(/EVAL_MAX_CALLS/);
  });
});
