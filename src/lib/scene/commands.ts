/**
 * Validated semantic actions. The brain (scripted now, a model later) can only
 * request these prepared operations, with ids that the CURRENT world declares.
 * Nothing model-written is executed as code; no remote URLs are accepted.
 */
import { isWorldId, WORLD_IDS, type CommandContext, type WorldId } from "@/lib/worlds/registry";

export const GESTURES = ["wave", "nod", "thumbs_up", "shrug", "think", "open_hands"] as const;
export type Gesture = (typeof GESTURES)[number];

export interface Choice { id: string; label: string }

export type SceneCommand =
  | { name: "gesture"; gesture: Gesture }
  | { name: "pointAt"; target: string }
  | { name: "moveTeacherTo"; spot: string }
  | { name: "writeOnBoard"; text: string }
  | { name: "openWorld"; world: WorldId }
  | { name: "offerChoices"; choices: Choice[] }
  | { name: "askQuestion"; questionId: string }
  | { name: "inviteTap"; target: string };

export type ParseResult = { ok: true; command: SceneCommand } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

/** Plain text only: control, invisible and bidi characters removed, cut by code point. */
export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const cleaned = v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, " ").replace(/\s+/g, " ").trim();
  const text = Array.from(cleaned).slice(0, max).join("").trim();
  return text || null;
}

export function parseSceneCommand(name: unknown, args: unknown, ctx: CommandContext): ParseResult {
  if (typeof name !== "string") return { ok: false, error: "command name must be a string" };
  if (!isObj(args)) return { ok: false, error: "arguments must be an object" };
  const list = (l: string[]) => (l.length ? l.join(", ") : "none here");
  switch (name) {
    case "gesture":
      return oneOf(GESTURES, args.gesture)
        ? { ok: true, command: { name, gesture: args.gesture } }
        : { ok: false, error: `gesture must be one of ${GESTURES.join(", ")}` };
    case "pointAt":
      return oneOf(ctx.targets, args.target)
        ? { ok: true, command: { name, target: args.target } }
        : { ok: false, error: `target must be one of: ${list(ctx.targets)}` };
    case "inviteTap":
      return oneOf(ctx.interactive, args.target)
        ? { ok: true, command: { name, target: args.target } }
        : { ok: false, error: `tappable objects here: ${list(ctx.interactive)}` };
    case "moveTeacherTo":
      return oneOf(ctx.spots, args.spot)
        ? { ok: true, command: { name, spot: args.spot } }
        : { ok: false, error: `spot must be one of: ${list(ctx.spots)}` };
    case "askQuestion":
      return oneOf(ctx.questions, args.questionId)
        ? { ok: true, command: { name, questionId: args.questionId } }
        : { ok: false, error: `questions here: ${list(ctx.questions)}` };
    case "writeOnBoard": {
      if (ctx.world !== "classroom") return { ok: false, error: "there is no board here" };
      const text = cleanText(args.text, 60);
      return text ? { ok: true, command: { name, text } } : { ok: false, error: "text must be a non-empty string" };
    }
    case "openWorld": {
      if (ctx.world === "transit") return { ok: false, error: "already travelling" };
      if (!isWorldId(args.world)) return { ok: false, error: "unknown world" };
      if (args.world === ctx.world) return { ok: false, error: "already there" };
      return { ok: true, command: { name, world: args.world } };
    }
    case "offerChoices": {
      if (!Array.isArray(args.choices) || args.choices.length < 1 || args.choices.length > 4)
        return { ok: false, error: "choices must be 1 to 4 items" };
      const choices: Choice[] = [];
      for (const c of args.choices) {
        if (!isObj(c)) return { ok: false, error: "each choice must be an object" };
        const id = cleanText(c.id, 32), label = cleanText(c.label, 48);
        if (!id || !label || !/^[a-z0-9_]+$/.test(id)) return { ok: false, error: "choice needs an id (a-z0-9_) and a label" };
        choices.push({ id, label });
      }
      return { ok: true, command: { name, choices } };
    }
    default:
      return { ok: false, error: `unknown command ${name.slice(0, 40)}` };
  }
}

export function parseToolCall(name: string, rawArgs: string, ctx: CommandContext): ParseResult {
  let args: unknown;
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return { ok: false, error: "arguments are not valid JSON" };
  }
  return parseSceneCommand(name, args, ctx);
}

/** JSON-schema tool definitions for a model brain, generated for the current world. */
export function toolsFor(ctx: CommandContext) {
  const tool = (name: string, description: string, properties: object, required: string[]) => ({
    name, description, input_schema: { type: "object", properties, required },
  });
  const tools = [
    tool("gesture", "Make a body gesture that fits what you are saying.", { gesture: { type: "string", enum: [...GESTURES] } }, ["gesture"]),
    tool("offerChoices", "Show the child 1-4 tappable reply options.", { choices: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } }, required: ["id", "label"] } } }, ["choices"]),
  ];
  if (ctx.targets.length) tools.push(tool("pointAt", "Turn and point at an object in this world.", { target: { type: "string", enum: ctx.targets } }, ["target"]));
  if (ctx.spots.length) tools.push(tool("moveTeacherTo", "Walk to a spot in this world.", { spot: { type: "string", enum: ctx.spots } }, ["spot"]));
  if (ctx.interactive.length) tools.push(tool("inviteTap", "Highlight an object and invite the child to tap and inspect it.", { target: { type: "string", enum: ctx.interactive } }, ["target"]));
  if (ctx.questions.length) tools.push(tool("askQuestion", "Ask a prepared, checkable question.", { questionId: { type: "string", enum: ctx.questions } }, ["questionId"]));
  if (ctx.world === "classroom") tools.push(tool("writeOnBoard", "Write a short phrase (max 60 chars) on the board.", { text: { type: "string" } }, ["text"]));
  if (ctx.world !== "transit") tools.push(tool("openWorld", "Travel to a prepared world.", { world: { type: "string", enum: WORLD_IDS.filter((w) => w !== ctx.world) } }, ["world"]));
  return tools;
}
