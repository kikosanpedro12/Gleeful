/** Pure helpers for the /admin dashboard (no server-only imports, safe in client components and tests). */

const TZ = "Asia/Manila";

export function manilaDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown time";
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: false }).format(d);
}
export function manilaUpdated(iso: string): string {
  return `${manilaDateTime(iso)} (Manila time)`;
}
/** "2026-11-24" -> "Nov 24" (the date string is already a Manila day). */
export function shortDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(d);
}

export interface Delta { text: string; tone: "good" | "bad" | "flat" }
/** Compare this range to the one before. `upIsGood` says whether more is better (false for cancellations and failures). */
export function delta(now: number, before: number, days: number, upIsGood: boolean): Delta {
  const span = `the ${days} days before`;
  if (now === before) return { text: before === 0 ? `None, same as ${span}` : `Same as ${span} (${before})`, tone: "flat" };
  const up = now > before;
  const tone = up === upIsGood ? "good" : "bad";
  const diff = Math.abs(now - before);
  const pct = before > 0 ? ` (${Math.round((diff / before) * 100)}%)` : "";
  return { text: `${up ? "Up" : "Down"} ${diff}${pct} from ${span} (${before})`, tone };
}

export function niceMax(max: number): number {
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= max) return m * pow;
  return 10 * pow;
}

export function pointsFor(values: number[], w: number, h: number, max: number, pad = 4): string {
  const n = values.length;
  return values.map((v, i) => `${n === 1 ? w / 2 : (i / (n - 1)) * w},${h - pad - (v / max) * (h - pad * 2)}`).join(" ");
}

export function pctOf(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}
