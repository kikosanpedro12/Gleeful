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

/** Words with a dot-TLD or scheme are links. We never speak a link. */
const LINKISH = /\b(?:https?|ftp|file|javascript|data|vbscript)\s*:\S*|\bwww\.\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:com|org|net|io|ai|app|dev|co|gov|edu|info|xyz|me|ly|tv|ph|uk|us)\b\S*/gi;

/** Plain spoken text: no tags, links, markdown or control characters, capped. */
export function sanitizeSay(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>?/g, " ")
    .replace(LINKISH, " ")
    .replace(/[<>*_`#~|\\{}]/g, " ")
    .replace(/\s+([,.!?])/g, "$1");
  const cleaned = cleanText(t, LIMITS.maxSayChars);
  return cleaned && /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : null;
}

export interface Block { type?: unknown; text?: unknown; name?: unknown; input?: unknown }

export function buildReply(blocks: unknown, world: WorldId | "transit", input: WireInput): { segments: Segment[]; dropped: number } | null {
  if (!Array.isArray(blocks)) return null;
  const segments: Segment[] = [];
  const pending: Action[] = [];
  let w: WorldId | "transit" = world;
  let dropped = 0;
  let total = 0;
  let travelling = false;

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
      if (!say) { dropped++; continue; }
      if (segments.length >= LIMITS.maxSegments) { dropped++; continue; }
      segments.push({ say, actions: segments.length === 0 ? pending.splice(0) : [] });
    } else if (b.type === "tool_use") {
      if (typeof b.name !== "string") { dropped++; continue; }
      const parsed = parseSceneCommand(b.name, b.input, contextFor(w));
      if (!parsed.ok) { dropped++; continue; }
      const { name, ...args } = parsed.command;
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
