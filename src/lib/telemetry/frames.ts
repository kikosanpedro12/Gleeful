/** Frame cadence: average fps plus the things an average hides. */
export interface FrameStats {
  frames: number;
  seconds: number;
  avgFps: number;
  /** 1% low: fps implied by the slowest 1% of frames. */
  low1Fps: number;
  worstFrameMs: number;
  /** Frames longer than 50 ms (visible hitch). */
  longFrames: number;
  /** Frames longer than 250 ms (stall). */
  stalls: number;
}

export class FrameMeter {
  private deltas: number[] = [];
  private total = 0;
  private count = 0;
  private long = 0;
  private stalled = 0;
  private worst = 0;
  private readonly cap = 3000;

  /** dt in seconds. Ignore huge gaps from a hidden tab. */
  push(dt: number) {
    const ms = dt * 1000;
    if (ms <= 0 || ms > 5000) return;
    this.count++;
    this.total += ms;
    if (ms > 50) this.long++;
    if (ms > 250) this.stalled++;
    if (ms > this.worst) this.worst = ms;
    this.deltas.push(ms);
    if (this.deltas.length > this.cap) this.deltas.shift();
  }

  stats(): FrameStats {
    const sorted = [...this.deltas].sort((a, b) => b - a);
    const n = Math.max(1, Math.ceil(sorted.length / 100));
    const slow = sorted.slice(0, n);
    const slowAvg = slow.length ? slow.reduce((a, b) => a + b, 0) / slow.length : 0;
    return {
      frames: this.count,
      seconds: Math.round(this.total / 100) / 10,
      avgFps: this.total ? Math.round((this.count / this.total) * 10000) / 10 : 0,
      low1Fps: slowAvg ? Math.round(10000 / slowAvg) / 10 : 0,
      worstFrameMs: Math.round(this.worst),
      longFrames: this.long,
      stalls: this.stalled,
    };
  }
}

export const frameMeter = new FrameMeter();
