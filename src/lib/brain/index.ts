import type { Brain } from "./types";
import { ScriptedBrain } from "./scriptedBrain";
import { ClaudeBrain } from "./claudeBrain";
import { FallbackBrain } from "./fallbackBrain";

/**
 * The scripted brain is the default. The model brain is opt-in per build with
 * NEXT_PUBLIC_BRAIN=model (a switch, not a secret), and always falls back to the script.
 */
export function createBrain(): Brain {
  return process.env.NEXT_PUBLIC_BRAIN === "model" ? new FallbackBrain(new ClaudeBrain(), new ScriptedBrain()) : new ScriptedBrain();
}
