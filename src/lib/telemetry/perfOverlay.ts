/**
 * ?perf=1 overlay maths and state. Nothing here runs unless the page was opened with exactly ?perf=1 (see PerfOverlay).
 * Numbers are measured on the visitor's own device; no claim beyond that.
 */
export function perfEnabled(search: string | undefined | null): boolean {
  if (!search || typeof search !== "string") return false;
  try { return new URLSearchParams(search).get("perf") === "1"; } catch { return false; }
}

/** Frames per second as a rolling average over the last `windowMs` of requestAnimationFrame deltas. */
export class RollingFps {
  private deltas: number[] = [];
  private sum = 0;
  constructor(private readonly windowMs = 2000) {}
  /** dtMs: time since the previous frame. Non-finite, non-positive and over-5 s gaps (hidden tab) are ignored. */
  push(dtMs: number) {
    if (!Number.isFinite(dtMs) || dtMs <= 0 || dtMs > 5000) return;
    this.deltas.push(dtMs); this.sum += dtMs;
    while (this.deltas.length > 1 && this.sum > this.windowMs) this.sum -= this.deltas.shift()!;
  }
  fps(): number { return this.sum > 0 ? (this.deltas.length * 1000) / this.sum : 0; }
  reset() { this.deltas = []; this.sum = 0; }
}

/** GLB load times in ms per teacher ("failed" if the load did not work), and a getter for the renderer's info. */
const loads = new Map<string, number | "failed">();
const listeners = new Set<() => void>();
export function recordGlbLoad(id: string, ms: number | "failed") { loads.set(id, ms); listeners.forEach((l) => l()); }
export const glbLoadTimes = (): [string, number | "failed"][] => [...loads.entries()];
export function onGlbLoad(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

export interface RenderCounts { triangles: number; calls: number }
let renderCounts: (() => RenderCounts) | null = null;
export function setRenderCounts(f: (() => RenderCounts) | null) { renderCounts = f; }
export const readRenderCounts = (): RenderCounts | null => (renderCounts ? renderCounts() : null);
