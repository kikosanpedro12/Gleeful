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
export interface Reach {
  configured: boolean | undefined;
  /** A private-test passcode is accepted by this deployment. */
  testerRequired: boolean;
  /** This tab holds a passcode. */
  hasCode: boolean;
  /** This browser has a verified parent session, and that parent's consent for the current wording is on file. */
  signedIn?: boolean;
  consented?: boolean;
}

/**
 * Nobody reaches the model anonymously: they need a signed-in parent WITH consent,
 * or a private-test passcode. Anything else gets the script, and the copy says so.
 */
export function aiReachable(modelBuild: boolean, r: Reach): boolean {
  const asParent = r.signedIn === true && r.consented === true;
  const asTester = r.testerRequired && r.hasCode;
  return modelBuild && r.configured === true && (asParent || asTester);
}

/** What the screen shows. Starts false: the scripted (non-AI) copy until the probe says otherwise. */
export const useReach = create<{ ai: boolean }>(() => ({ ai: false }));

/** Probe result shared with ClaudeBrain so the page asks the server once. */
const probe: { configured: boolean | undefined; testerRequired: boolean; signedIn: boolean; consented: boolean; asked: Promise<void> | null } =
  { configured: undefined, testerRequired: false, signedIn: false, consented: false, asked: null };

export function probeState() { return { configured: probe.configured, testerRequired: probe.testerRequired, signedIn: probe.signedIn, consented: probe.consented }; }
export function resetReach() { probe.configured = undefined; probe.testerRequired = false; probe.signedIn = false; probe.consented = false; probe.asked = null; useReach.setState({ ai: false }); }
/** The server said this visitor has no access after all (signed out, consent withdrawn): stop claiming an AI teacher. */
export function noteAccessLost() { probe.signedIn = false; probe.consented = false; }

/** Recompute what the screen may claim (call after the probe, or after the tester code changes). */
export function refreshReach(modelBuild = MODEL_BUILD) {
  const ai = aiReachable(modelBuild, { configured: probe.configured, testerRequired: probe.testerRequired, hasCode: !!getTesterCode(), signedIn: probe.signedIn, consented: probe.consented });
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
          const j = (await res.json()) as { configured?: unknown; testerRequired?: unknown; signedIn?: unknown; consented?: unknown };
          if (typeof j.configured === "boolean") probe.configured = j.configured;
          probe.testerRequired = j.testerRequired === true;
          probe.signedIn = j.signedIn === true;
          probe.consented = j.consented === true;
        }
      } catch { /* cannot tell */ }
    })();
  }
  return probe.asked.then(() => refreshReach(modelBuild));
}
