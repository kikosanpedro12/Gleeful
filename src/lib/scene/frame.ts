/**
 * Story scenes (docs/SCENE_KIT_SPEC.md v0.2): a small diorama the brain can show beside the lesson. The model sends
 * ids and short text only; every id must exist in our own manifests, and no coordinates, code, markup or URLs are
 * accepted. Layout is decided here, by code. Pure data, safe on client and server.
 */
import { ASSETS, assetById, checkAssets, MAX_SCENE_KB } from "@/lib/assets/manifest";
import { figureById, FIGURES } from "@/lib/assets/figures";

export const SETTINGS = {
  study: { label: "a quiet room", sky: "#e9dcc3", ground: "#8a6a4a" },
  ancient_city: { label: "an old city", sky: "#f1d9a8", ground: "#b99b6b" },
  countryside: { label: "open country", sky: "#bfe0f2", ground: "#6f9a52" },
  forest: { label: "a forest", sky: "#a9cfae", ground: "#4d6b3a" },
  market_street: { label: "a busy street", sky: "#f2d2b0", ground: "#a38b6d" },
  seaside: { label: "the seaside", sky: "#b7def0", ground: "#d9c79a" },
  desert: { label: "a desert", sky: "#f6dcae", ground: "#d2a766" },
  night_sky: { label: "the night sky", sky: "#0c1226", ground: "#2a2f44" },
} as const;
export type SettingId = keyof typeof SETTINGS;
export const SETTING_IDS = Object.keys(SETTINGS) as SettingId[];

export const MAX_PROPS = 6;
export const PRETEND_LABEL = "A pretend picture to help us imagine, not the real thing.";

/** Where a 3D figure stands and how close the camera is. The model picks one of these words; code does the rest. */
export const PLACEMENTS = ["left", "center", "right"] as const;
export const VIEWS = ["full", "closeup"] as const;
export type Placement = (typeof PLACEMENTS)[number];
export type View = (typeof VIEWS)[number];

export interface StoryFrame {
  setting: SettingId;
  /** Short plain-text caption, e.g. "France, about 1805". */
  era: string;
  props: string[];
  figure?: string;
  /** Only used with a 3D figure. Default: right, full. */
  placement?: Placement;
  view?: View;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const cleaned = v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, " ").replace(/\s+/g, " ").trim();
  const t = Array.from(cleaned).slice(0, max).join("").trim();
  return t || null;
}

export type FrameResult = { ok: true; frame: StoryFrame } | { ok: false; error: string };

export function parseFrame(args: unknown): FrameResult {
  if (!isObj(args)) return { ok: false, error: "scene must be an object" };
  const setting = args.setting;
  if (typeof setting !== "string" || !Object.hasOwn(SETTINGS, setting)) return { ok: false, error: `setting must be one of ${SETTING_IDS.join(", ")}` };
  const era = text(args.era, 60);
  if (!era) return { ok: false, error: "era must be short text" };
  const rawProps = args.props === undefined ? [] : args.props;
  if (!Array.isArray(rawProps) || rawProps.length > MAX_PROPS) return { ok: false, error: `props must be a list of up to ${MAX_PROPS} ids` };
  const props: string[] = [];
  for (const p of rawProps) {
    if (typeof p !== "string" || !assetById(p)) return { ok: false, error: "unknown prop id" };
    if (!props.includes(p)) props.push(p);
  }
  const bad = checkAssets(props);
  if (bad) return { ok: false, error: bad };
  let figure: string | undefined;
  if (args.figure !== undefined) {
    if (typeof args.figure !== "string" || !figureById.has(args.figure)) return { ok: false, error: "unknown figure id" };
    figure = args.figure;
  }
  let placement: Placement | undefined;
  if (args.placement !== undefined) {
    if (typeof args.placement !== "string" || !(PLACEMENTS as readonly string[]).includes(args.placement)) return { ok: false, error: `placement must be one of ${PLACEMENTS.join(", ")}` };
    placement = args.placement as Placement;
  }
  let view: View | undefined;
  if (args.view !== undefined) {
    if (typeof args.view !== "string" || !(VIEWS as readonly string[]).includes(args.view)) return { ok: false, error: `view must be one of ${VIEWS.join(", ")}` };
    view = args.view as View;
  }
  // The figure's model downloads with the picture, so it counts toward the same budget as the props.
  const fig = figure ? figureById.get(figure) : undefined;
  if (fig?.kb && props.reduce((n, id) => n + (assetById(id)?.kb ?? 0), 0) + fig.kb > MAX_SCENE_KB) return { ok: false, error: "scene too large" };
  return { ok: true, frame: { setting: setting as SettingId, era, props, ...(figure ? { figure } : {}), ...(placement ? { placement } : {}), ...(view ? { view } : {}) } };
}

export const frameToArgs = (f: StoryFrame): Record<string, unknown> => ({
  setting: f.setting, era: f.era, props: [...f.props],
  ...(f.figure ? { figure: f.figure } : {}), ...(f.placement ? { placement: f.placement } : {}), ...(f.view ? { view: f.view } : {}),
});

/** For the tool schema and the prompt: the ids the model may use. */
export const propIds = () => ASSETS.map((a) => a.id);
export const figureIds = () => FIGURES.map((f) => f.id);

/** Fixed slots in front of the camera, nearest the middle first. Code decides placement, never the model. */
export const PROP_SLOTS: [number, number][] = [[0, -0.6], [-0.9, -0.9], [0.9, -0.9], [-1.6, -1.5], [1.6, -1.5], [0, -1.8]];
