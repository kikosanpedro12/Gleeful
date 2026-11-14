/**
 * Scene-kit widgets (docs/SCENE_KIT_SPEC.md): small 2D teaching aids the brain can put on screen with the
 * validated `showWidget` command. Pure data and pure functions, safe on the client and the server.
 * The model sends numbers and short enums only; everything is range-checked here and nothing is executed.
 *
 * Interaction is deliberately small: on a number line the child taps a tick; on fraction bars the child shades
 * parts of the FIRST bar (any further bars are fixed reference bars, e.g. to show equal fractions).
 * Whether the child's setting matches the ask is computed by `matches`, in code, from the target the brain set.
 */
export const WIDGET_KINDS = ["number_line", "fraction_bars"] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];

export interface NumberLineSpec {
  kind: "number_line";
  min: number;
  max: number;
  step: number;
  /** How tick labels are written. */
  format: "integer" | "decimal" | "fraction";
  /** Fraction labels are in this denominator (2..12). Ignored for other formats. */
  denominator: number;
  /** Fixed dots with labels (e.g. the numbers being compared). */
  marks: number[];
  /** What the child is asked to find (optional). */
  target?: number;
}

export interface FractionBarsSpec {
  kind: "fraction_bars";
  /** 1 to 4 bars of equal width. Bar 0 is the child's; the rest are reference bars. */
  bars: { parts: number; shaded: number }[];
  /** What the child is asked to shade on bar 0 (optional), as a fraction. */
  target?: { num: number; den: number };
}

export type WidgetSpec = NumberLineSpec | FractionBarsSpec;

export const MAX_TICKS = 24;
export const MAX_MARKS = 6;
export const MAX_BARS = 4;
export const MAX_PARTS = 12;
const EPS = 1e-9;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1000 ? v : null);
const int = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const nearInt = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;

export type WidgetParse = { ok: true; spec: WidgetSpec } | { ok: false; error: string };
const err = (error: string): WidgetParse => ({ ok: false, error });

/** Validate the arguments of showWidget. Unknown keys are ignored; anything out of range is refused. */
export function parseWidget(args: unknown): WidgetParse {
  if (!isObj(args)) return err("arguments must be an object");
  if (args.widget === "number_line") {
    const min = num(args.min), max = num(args.max), step = num(args.step);
    if (min === null || max === null || step === null) return err("number_line needs numeric min, max and step");
    if (!(max > min)) return err("max must be greater than min");
    if (!(step > 0)) return err("step must be positive");
    const ticks = Math.round((max - min) / step);
    if (ticks < 1 || ticks > MAX_TICKS || Math.abs(ticks * step - (max - min)) > 1e-6) return err(`(max - min) must be a whole number of steps, 1 to ${MAX_TICKS}`);
    const format = args.format === undefined ? "integer" : args.format;
    if (format !== "integer" && format !== "decimal" && format !== "fraction") return err("format must be integer, decimal or fraction");
    if (format === "integer") for (const v of [min, max, step]) if (!nearInt(v)) return err("integer format needs whole-number min, max and step");
    if (format === "decimal") for (const v of [min, max, step]) if (Math.abs(v * 1000 - Math.round(v * 1000)) > 1e-6) return err("decimal format allows at most 3 decimals");
    let denominator = 1;
    if (format === "fraction") {
      const d = int(args.denominator, 2, 12);
      if (d === null) return err("fraction format needs an integer denominator from 2 to 12");
      denominator = d;
      for (const v of [min, max, step]) if (!nearInt(v * d)) return err("min, max and step must be multiples of 1/denominator");
    }
    const marks: number[] = [];
    if (args.marks !== undefined) {
      if (!Array.isArray(args.marks) || args.marks.length > MAX_MARKS) return err(`marks must be a list of up to ${MAX_MARKS} numbers`);
      for (const m of args.marks) {
        const v = num(m);
        if (v === null || v < min - EPS || v > max + EPS) return err("every mark must be a number inside the line");
        if (format === "fraction" && !nearInt(v * denominator)) return err("fraction marks must be multiples of 1/denominator");
        marks.push(v);
      }
    }
    let target: number | undefined;
    if (args.target !== undefined) {
      const t = num(args.target);
      if (t === null || t < min - EPS || t > max + EPS || !nearInt((t - min) / step)) return err("target must sit on a tick of the line");
      target = t;
    }
    return { ok: true, spec: { kind: "number_line", min, max, step, format, denominator, marks, ...(target !== undefined ? { target } : {}) } };
  }
  if (args.widget === "fraction_bars") {
    if (!Array.isArray(args.bars) || args.bars.length < 1 || args.bars.length > MAX_BARS) return err(`bars must be a list of 1 to ${MAX_BARS} bars`);
    const bars: FractionBarsSpec["bars"] = [];
    for (const b of args.bars) {
      if (!isObj(b)) return err("each bar must be an object");
      const parts = int(b.parts, 1, MAX_PARTS);
      if (parts === null) return err(`parts must be a whole number from 1 to ${MAX_PARTS}`);
      const shaded = b.shaded === undefined ? 0 : int(b.shaded, 0, parts);
      if (shaded === null) return err("shaded must be a whole number from 0 up to parts");
      bars.push({ parts, shaded });
    }
    let target: FractionBarsSpec["target"];
    if (args.target_num !== undefined || args.target_den !== undefined) {
      const den = int(args.target_den, 1, MAX_PARTS * 2), n = int(args.target_num, 0, MAX_PARTS * 2);
      if (den === null || n === null || n > den) return err("target_num/target_den must be a fraction between 0 and 1");
      target = { num: n, den };
    }
    return { ok: true, spec: { kind: "fraction_bars", bars, ...(target ? { target } : {}) } };
  }
  return err(`widget must be one of ${WIDGET_KINDS.join(", ")}`);
}

// --------------------------------------------------------------------------------------- values

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));

/** "3/4", "1 1/2", "0.5", "-2" for a number, in the line's format. */
export function formatValue(v: number, spec: Pick<NumberLineSpec, "format" | "denominator">): string {
  if (spec.format === "fraction") {
    const total = Math.round(v * spec.denominator);
    return formatFraction(total, spec.denominator);
  }
  if (spec.format === "decimal") return String(Math.round(v * 1000) / 1000);
  return String(Math.round(v));
}

export function formatFraction(numerator: number, denominator: number): string {
  if (numerator === 0) return "0";
  const sign = numerator < 0 ? "-" : "";
  const n = Math.abs(numerator);
  const g = gcd(n, denominator) || 1;
  const rn = n / g, rd = denominator / g;
  if (rd === 1) return `${sign}${rn}`;
  const whole = Math.floor(rn / rd), rem = rn % rd;
  return whole ? `${sign}${whole} ${rem}/${rd}` : `${sign}${rem}/${rd}`;
}

/** Parse what the child's widget reports ("3/4", "1 1/2", "0.5", "-2"). Null if it is not a plain number. */
export function parseValue(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!/^-?\d{1,4}(?:\.\d{1,3})?$|^-?\d{1,3}\/\d{1,3}$|^-?\d{1,3} \d{1,3}\/\d{1,3}$/.test(t)) return null;
  const neg = t.startsWith("-");
  const body = neg ? t.slice(1) : t;
  let v: number;
  if (body.includes(" ")) {
    const [w, f] = body.split(" ");
    const [a, b] = f.split("/").map(Number);
    if (!b) return null;
    v = Number(w) + a / b;
  } else if (body.includes("/")) {
    const [a, b] = body.split("/").map(Number);
    if (!b) return null;
    v = a / b;
  } else v = Number(body);
  return Number.isFinite(v) ? (neg ? -v : v) : null;
}

/** Same number, however it is written (1/2 = 2/4 = 0.5). */
export const sameValue = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** Is the child's setting what the brain asked for? null when nothing was asked or the values are unreadable. */
export function matches(value: string, target: string | undefined): boolean | null {
  if (target === undefined) return null;
  const v = parseValue(value), t = parseValue(target);
  if (v === null || t === null) return null;
  return sameValue(v, t);
}

/** The target as the string the wire carries, in the widget's own format. */
export function targetString(spec: WidgetSpec): string | undefined {
  if (spec.kind === "number_line") return spec.target === undefined ? undefined : formatValue(spec.target, spec);
  return spec.target ? formatFraction(spec.target.num, spec.target.den) : undefined;
}

/** Plain-words description for the model and for screen readers. */
export function describeWidget(spec: WidgetSpec): string {
  if (spec.kind === "number_line") {
    const parts = [`a number line from ${formatValue(spec.min, spec)} to ${formatValue(spec.max, spec)}`];
    if (spec.marks.length) parts.push(`with dots at ${spec.marks.map((m) => formatValue(m, spec)).join(", ")}`);
    return parts.join(" ");
  }
  return `fraction bars: ${spec.bars.map((b) => `${b.shaded} of ${b.parts} parts shaded`).join("; ")}`;
}

/** The raw argument shape (what the model sends and what parseWidget accepts), so a validated spec can travel again. */
export function widgetToArgs(spec: WidgetSpec): Record<string, unknown> {
  if (spec.kind === "number_line") {
    return { widget: "number_line", min: spec.min, max: spec.max, step: spec.step, format: spec.format, ...(spec.format === "fraction" ? { denominator: spec.denominator } : {}), marks: spec.marks, ...(spec.target !== undefined ? { target: spec.target } : {}) };
  }
  return { widget: "fraction_bars", bars: spec.bars.map((b) => ({ ...b })), ...(spec.target ? { target_num: spec.target.num, target_den: spec.target.den } : {}) };
}
