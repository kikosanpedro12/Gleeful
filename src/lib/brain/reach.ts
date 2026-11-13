import { create } from "zustand";
import { MODEL_BUILD } from "./mode";
import { getTesterCode } from "./tester";
import { BRAIN_ENDPOINT } from "./protocol";

/**
 * Can THIS visitor actually reach the AI right now? Honesty copy ("AI teacher",
 * "answers come from an AI") must follow this, never the build flag alone: a model
 * build behind the tester gate gives every visitor without the code the script,
 * and they must not be told they are talking to an AI.
 *
 * `configured` is from GET /api/brain (key present, not disabled, gate not
 * misconfigured). Undefined = not asked yet or could not tell → treated as NO.
 */
export interface Reach { configured: boolean | undefined; testerRequired: boolean; hasCode: boolean }

export function aiReachable(modelBuild: boolean, r: Reach): boolean {
  return modelBuild && r.configured === true && (!r.testerRequired || r.hasCode);
}

/** What the screen shows. Starts false: the scripted (non-AI) copy until the probe says otherwise. */
export const useReach = create<{ ai: boolean }>(() => ({ ai: false }));

/** Probe result shared with ClaudeBrain so the page asks the server once. */
const probe: { configured: boolean | undefined; testerRequired: boolean; asked: Promise<void> | null } = { configured: undefined, testerRequired: false, asked: null };

export function probeState() { return { configured: probe.configured, testerRequired: probe.testerRequired }; }
export function resetReach() { probe.configured = undefined; probe.testerRequired = false; probe.asked = null; useReach.setState({ ai: false }); }

/** Recompute what the screen may claim (call after the probe, or after the tester code changes). */
export function refreshReach(modelBuild = MODEL_BUILD) {
  const ai = aiReachable(modelBuild, { configured: probe.configured, testerRequired: probe.testerRequired, hasCode: !!getTesterCode() });
  if (useReach.getState().ai !== ai) useReach.setState({ ai });
}

/**
 * One GET per page. A 200 {configured:boolean} is believed; anything else (network,
 * 404, odd body) leaves `configured` undefined, so the copy stays non-AI and the POST
 * path still decides.
 */
export function probeBrain(f: typeof fetch = (...a) => fetch(...a), endpoint = BRAIN_ENDPOINT, modelBuild = MODEL_BUILD): Promise<void> {
  if (!probe.asked) {
    probe.asked = (async () => {
      try {
        const res = await f(endpoint, { method: "GET", credentials: "same-origin", cache: "no-store" });
        if (res.ok) {
          const j = (await res.json()) as { configured?: unknown; testerRequired?: unknown };
          if (typeof j.configured === "boolean") probe.configured = j.configured;
          probe.testerRequired = j.testerRequired === true;
        }
      } catch { /* cannot tell */ }
    })();
  }
  return probe.asked.then(() => refreshReach(modelBuild));
}
