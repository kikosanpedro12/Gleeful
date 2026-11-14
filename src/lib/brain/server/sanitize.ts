import "server-only";
/**
 * Everything the model returns is untrusted. This turns Anthropic content blocks
 * into the same { segments } shape the scripted brain returns, keeping only
 * plain text and commands that pass the world's validator.
 */
import { LIMITS } from "./config";
import type { Action, Segment } from "../types";
import { cleanText, parseSceneCommand } from "@/lib/scene/commands";
import { contextFor, WORLDS, type WorldId } from "@/lib/worlds/registry";
import type { WireInput } from "../protocol";

/**
 * Anything that looks like a link or address is removed. We never speak or show one.
 * Covers: schemes, www., hosts ending in a long list of TLDs (with any path),
 * scheme-less host/path, bare IPv4 addresses, e-mail addresses, and a spelled-out "name dot com".
 */
const TLDS = "com|org|net|io|ai|app|dev|co|gov|edu|info|xyz|me|ly|tv|ph|uk|us|site|shop|link|click|top|online|store|tech|club|live|fun|page|website|space|cloud|biz|cc|ws|gg|to|sh|so|ru|cn|in|de|fr|jp|ca|au|ink|vip|win|icu|cyou|buzz|pro|mobi|name|zip|mov|ly|gl|ae|sa|kr|br|mx|es|it|nl|se|ch|pw|tk|ml|ga|cf|gq|work|world|today|news|life|email|support|center|run|bio|one|art|lol|wtf";
/** The spelled-out form uses only unambiguous endings ("the dot to the next dot" is just teaching). */
const SPOKEN_TLDS = "com|org|net|io|ai|app|dev|gov|edu|xyz|info|shop|site|link|click";
const LINKISH = new RegExp(
  [
    String.raw`[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,4}`,
    String.raw`\b(?:https?|ftp|file|javascript|data|vbscript)\s*:\S*`,
    String.raw`\bwww\.\S+`,
    String.raw`\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:/\S*)?`,
    String.raw`\b[\w-]+(?:\.[\w-]+)*\.(?:${TLDS})\b(?:[/:?#]\S*)?`,
    String.raw`\b[\w-]+(?:\.[\w-]+)+/\S*`,
    String.raw`\b[\w-]+\s+dot\s+(?:${SPOKEN_TLDS})\b`,
  ].join("|"),
  "gi",
);

/** Plain spoken text: no tags, links, markdown or control characters, capped. */
export function sanitizeSay(v: unknown, max: number = LIMITS.maxSayChars): string | null {
  if (typeof v !== "string") return null;
  const t = v
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>?/g, " ")
    .replace(LINKISH, " ")
    .replace(/[<>*_`#~|\\{}]/g, " ")
    .replace(/\s+([,.!?])/g, "$1");
  const cleaned = cleanText(t, max);
  return cleaned && /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : null;
}

/**
 * Backstop: the model planning out loud ("The child tapped the rock, so I should...") instead of
 * talking to the child. The teacher never calls the child "the child" or talks about its own
 * instructions, so such a line is dropped rather than spoken.
 */
const NARRATION = /\b(the|this) (child|kid|learner|student|user)\b|\bI should\b|\b(system prompt|the record|listed facts|my instructions|tool call)\b|\bsession \d+\b/i;
export function looksLikeNarration(text: string): boolean { return NARRATION.test(text); }

export interface Block { type?: unknown; text?: unknown; name?: unknown; input?: unknown }

export function buildReply(blocks: unknown, world: WorldId | "transit", input: WireInput): { segments: Segment[]; dropped: number } | null {
  if (!Array.isArray(blocks)) return null;
  const segments: Segment[] = [];
  const pending: Action[] = [];
  let w: WorldId | "transit" = world;
  let dropped = 0;
  let total = 0;
  let travelling = false;
  let interactive = 0;

  const attach = (a: Action) => {
    if (total >= LIMITS.maxActionsPerReply) { dropped++; return; }
    const target = segments.length ? segments[segments.length - 1] : null;
    if (target) {
      if ((target.actions?.length ?? 0) >= LIMITS.maxActionsPerSegment) { dropped++; return; }
      (target.actions ??= []).push(a);
    } else pending.push(a);
    total++;
  };

  for (const raw of blocks.slice(0, 24)) {
    if (travelling) break;
    const b = raw as Block;
    if (!b || typeof b !== "object") { dropped++; continue; }
    if (b.type === "text") {
      const say = sanitizeSay(b.text);
      if (!say || looksLikeNarration(say)) { dropped++; continue; }
      if (segments.length >= LIMITS.maxSegments) { dropped++; continue; }
      segments.push({ say, actions: segments.length === 0 ? pending.splice(0) : [] });
    } else if (b.type === "tool_use") {
      if (typeof b.name !== "string") { dropped++; continue; }
      const parsed = parseSceneCommand(b.name, b.input, contextFor(w));
      if (!parsed.ok) { dropped++; continue; }
      // One question or choice set per reply is enforced here, not left to the prompt.
      if (parsed.command.name === "askQuestion" || parsed.command.name === "offerChoices") {
        if (interactive >= 1) { dropped++; continue; }
        interactive++;
      }
      // Text the model puts on the board or on a button gets the same treatment as speech.
      const cmd = parsed.command;
      if (cmd.name === "writeOnBoard") {
        const t = sanitizeSay(cmd.text, 60);
        if (!t) { dropped++; continue; }
        cmd.text = t;
      } else if (cmd.name === "offerChoices") {
        const kept = cmd.choices.flatMap((c) => { const label = sanitizeSay(c.label, 48); return label ? [{ id: c.id, label }] : []; });
        if (!kept.length) { dropped++; continue; }
        cmd.choices = kept;
      }
      const { name, ...args } = cmd;
      attach({ name, args });
      if (name === "openWorld") { w = "transit"; travelling = true; }
    } else dropped++;
  }
  if (!segments.length) return null;
  for (const s of segments) if (!s.actions?.length) delete s.actions;

  // Honesty enforced in code, not left to the model: arriving somewhere simulated must say so.
  if (input.kind === "world_ready") {
    const def = WORLDS[input.world];
    if (def.simulationNotice && !segments.some((s) => /simulat/i.test(s.say))) {
      segments.unshift({ say: `Remember, this is a simulation, not the real ${def.title}.` });
    }
  }
  return { segments, dropped };
}
