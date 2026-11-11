/**
 * Validated semantic actions. The model can only request these prepared
 * operations; nothing model-written is ever executed as code and no remote
 * URLs are accepted. Phase 1 exposes classroom actions only; openWorld etc.
 * are reserved for Phase 2 and rejected with a clear reason until built.
 */
export const GESTURES = ["wave", "nod", "thumbs_up", "shrug", "think", "open_hands"] as const;
export type Gesture = (typeof GESTURES)[number];

export const POINT_TARGETS = ["board", "mars_globe", "bookshelf", "window"] as const;
export type PointTarget = (typeof POINT_TARGETS)[number];

export const SPOTS = ["center", "board_side", "desk_side"] as const;
export type Spot = (typeof SPOTS)[number];

export type SceneCommand =
  | { name: "gesture"; gesture: Gesture }
  | { name: "pointAt"; target: PointTarget }
  | { name: "moveTeacherTo"; spot: Spot }
  | { name: "writeOnBoard"; text: string };

export const RESERVED_COMMANDS = ["openWorld", "showDiagram", "askPracticeQuestion"] as const;

export type ParseResult = { ok: true; command: SceneCommand } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

export function parseSceneCommand(name: unknown, args: unknown): ParseResult {
  if (typeof name !== "string") return { ok: false, error: "command name must be a string" };
  if ((RESERVED_COMMANDS as readonly string[]).includes(name))
    return { ok: false, error: `${name} is not available in this build yet` };
  if (!isObj(args)) return { ok: false, error: "arguments must be an object" };
  switch (name) {
    case "gesture":
      return oneOf(GESTURES, args.gesture)
        ? { ok: true, command: { name, gesture: args.gesture } }
        : { ok: false, error: `gesture must be one of ${GESTURES.join(", ")}` };
    case "pointAt":
      return oneOf(POINT_TARGETS, args.target)
        ? { ok: true, command: { name, target: args.target } }
        : { ok: false, error: `target must be one of ${POINT_TARGETS.join(", ")}` };
    case "moveTeacherTo":
      return oneOf(SPOTS, args.spot)
        ? { ok: true, command: { name, spot: args.spot } }
        : { ok: false, error: `spot must be one of ${SPOTS.join(", ")}` };
    case "writeOnBoard": {
      if (typeof args.text !== "string") return { ok: false, error: "text must be a string" };
      // Plain text only, short, no control chars. Rendered to a canvas, never as HTML.
      // Control + invisible/bidi characters removed; cut by code point so emoji are not split.
      const cleaned = args.text.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, " ").trim();
      const text = Array.from(cleaned).slice(0, 60).join("").trim();
      if (!text) return { ok: false, error: "text is empty" };
      return { ok: true, command: { name, text } };
    }
    default:
      return { ok: false, error: `unknown command ${name.slice(0, 40)}` };
  }
}

export function parseToolCall(name: string, rawArgs: string): ParseResult {
  let args: unknown;
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return { ok: false, error: "arguments are not valid JSON" };
  }
  return parseSceneCommand(name, args);
}

/** Tool definitions sent to the voice model (JSON Schema). */
export const SCENE_TOOLS = [
  {
    type: "function",
    name: "gesture",
    description: "Make a body gesture that fits what you are saying right now.",
    parameters: {
      type: "object",
      properties: { gesture: { type: "string", enum: [...GESTURES] } },
      required: ["gesture"],
    },
  },
  {
    type: "function",
    name: "pointAt",
    description: "Turn and point at a real object in the classroom while you talk about it.",
    parameters: {
      type: "object",
      properties: { target: { type: "string", enum: [...POINT_TARGETS] } },
      required: ["target"],
    },
  },
  {
    type: "function",
    name: "moveTeacherTo",
    description: "Walk to a spot in the classroom.",
    parameters: { type: "object", properties: { spot: { type: "string", enum: [...SPOTS] } }, required: ["spot"] },
  },
  {
    type: "function",
    name: "writeOnBoard",
    description: "Write a short word or phrase (max 60 characters) on the classroom board.",
    parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
] as const;
