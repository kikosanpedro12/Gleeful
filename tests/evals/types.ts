/**
 * Eval case format (docs/BRAIN_LEARNING.md "Eval suite"). A case is DATA: a prompt, checkable expectations,
 * and canned model outputs. Offline, the canned outputs run through the REAL sanitizers and validators:
 *   good        a model output that must pass every check
 *   neutralised a bad model output that the code must clean up so that it passes (a link stripped, a profane line replaced)
 *   bad         a model output that the checks must FLAG (proves the eval would notice a regression in the model)
 * Live (--live) sends `prompt` to the real model and applies the same checks to what comes back.
 */
import type { WireInput } from "@/lib/brain/protocol";
import type { WorldId } from "@/lib/worlds/registry";

export type Area = "safety" | "format" | "commands" | "honesty" | "pedagogy" | "accuracy";
export type Surface = "taste" | "lesson";
/** Anthropic content blocks, as the API returns them. */
export type Blocks = unknown[];
export const text = (t: string): Blocks => [{ type: "text", text: t }];

export interface Expect {
  /** Reply text must match at least one (unless `unsureOk` and the reply says it is not sure). */
  mustMatch?: RegExp[];
  /** Reply text must match none. */
  mustNot?: RegExp[];
  unsureOk?: boolean;
  /** Apply the rules of a child-safety case from src/lib/safety/cases.ts (by id). */
  safety?: string;
  /** The reply must be the fixed SAFE_REDIRECT line (output moderation fired). */
  redirect?: boolean;
  /** Exactly these (true = present, false = absent). */
  scene?: boolean;
  gesture?: string | false;
  board?: string | false;
  /** Lesson surface: the validated action names, in order. */
  actions?: string[];
  /** Lesson surface: at least this many commands/blocks dropped. */
  minDropped?: number;
  /** No reply text at all is the right outcome. */
  noText?: boolean;
}

export interface Sample {
  blocks: Blocks;
  /** Taste surface only: the model hit max_tokens, so a cut-off last line must not be shown. */
  truncated?: boolean;
  /** Run this sample on these surfaces only (default: the case's). */
  surfaces?: Surface[];
  /** Replace the case's expectations for this sample (e.g. a moderated line is the fixed redirect, not the ideal answer). */
  expect?: Expect;
  /** Set when this sample is NOT yet handled by the real code on that surface: it must keep failing (and flips to a fail when fixed, so the note gets removed). */
  knownGap?: { surface: Surface; why: string };
}

export interface EvalCase {
  id: string;
  area: Area;
  title: string;
  /** What the child or visitor says (sent to the model in --live). */
  prompt: string;
  /** Which pipelines the canned outputs run through. Default both. Live uses the first. */
  surfaces?: Surface[];
  world?: WorldId | "transit";
  input?: WireInput;
  expect: Expect;
  /** Curated facts this case relies on (must exist in the registry with a source). */
  facts?: { world: WorldId; id: string }[];
  good?: Sample[];
  neutralised?: Sample[];
  bad?: Sample[];
}

/** A hostile or valid scene command and whether the validator must accept it. */
export interface CommandCase {
  id: string;
  title: string;
  world: WorldId | "transit";
  name: unknown;
  /** Object args for parseSceneCommand, or a raw JSON string for parseToolCall. */
  args: unknown;
  ok: boolean;
}

export interface Result { id: string; area: Area; pass: boolean; problems: string[]; note?: string }
