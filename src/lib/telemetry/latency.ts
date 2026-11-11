/**
 * Response-time measurement. We record several clocks per turn and never
 * collapse them into one flattering number:
 *  - utteranceEnd:  local mic estimate of when the child actually stopped
 *  - vadEnd:        when the turn detector declared end of speech
 *  - firstAudio:    first AUDIBLE model output (energy on the output stream)
 *  - firstAnimation: first speaking/gesture animation for that turn
 * Whether the first audio was *meaningful* (not filler) needs a human check;
 * see docs/DEVICE_CHECKLIST.md.
 */
export interface TurnTiming {
  turnId: number;
  mode: "live" | "demo";
  input: "voice" | "text";
  /** First turn after connect: includes warm-up effects. */
  cold: boolean;
  utteranceEnd?: number;
  vadEnd?: number;
  textSubmit?: number;
  firstAudio?: number;
  firstAnimation?: number;
  interrupted?: boolean;
  failed?: boolean;
}

export interface TurnResult {
  turnId: number;
  mode: "live" | "demo";
  input: "voice" | "text";
  cold: boolean;
  /** Actual end of speech (or text submit) -> first audible output. The headline number. */
  endToAudioMs?: number;
  /** Detector end -> first audible output (excludes VAD wait). */
  vadToAudioMs?: number;
  /** How long the turn detector waited after the child stopped. */
  vadDelayMs?: number;
  /** Actual end -> first animation. */
  endToAnimationMs?: number;
  outcome: "ok" | "interrupted" | "failed";
}

const diff = (a?: number, b?: number) => (a !== undefined && b !== undefined ? Math.round(b - a) : undefined);

export function toResult(t: TurnTiming): TurnResult {
  const start = t.input === "voice" ? (t.utteranceEnd ?? t.vadEnd) : t.textSubmit;
  const outcome = t.firstAudio !== undefined ? "ok" : t.interrupted ? "interrupted" : "failed";
  return {
    turnId: t.turnId,
    mode: t.mode,
    input: t.input,
    cold: t.cold,
    endToAudioMs: diff(start, t.firstAudio),
    vadToAudioMs: t.input === "voice" ? diff(t.vadEnd, t.firstAudio) : undefined,
    vadDelayMs: t.input === "voice" ? diff(t.utteranceEnd, t.vadEnd) : undefined,
    endToAnimationMs: diff(start, t.firstAnimation),
    outcome,
  };
}

export function percentile(values: number[], p: number): number | undefined {
  if (!values.length) return undefined;
  const s = [...values].sort((a, b) => a - b);
  // nearest-rank
  const rank = Math.max(1, Math.ceil((p / 100) * s.length));
  return s[rank - 1];
}

export const TARGET_MEDIAN_MS = 2000;
export const TARGET_P95_MS = 4000;

export interface LatencySummary {
  mode: "live" | "demo";
  samples: number;
  failures: number;
  interrupted: number;
  medianMs?: number;
  p95Ms?: number;
  medianVadDelayMs?: number;
  medianAnimationMs?: number;
  overTarget: number;
  /** null = not enough evidence to say. */
  meetsTarget: boolean | null;
}

export const MIN_SAMPLES_FOR_VERDICT = 20;

export function summarize(results: TurnResult[], mode: "live" | "demo", opts: { warmOnly?: boolean } = {}): LatencySummary {
  const rs = results.filter((r) => r.mode === mode && (!opts.warmOnly || !r.cold));
  const ok = rs.filter((r) => r.outcome === "ok" && r.endToAudioMs !== undefined);
  const lat = ok.map((r) => r.endToAudioMs!);
  const nums = (k: "vadDelayMs" | "endToAnimationMs") => ok.map((r) => r[k]).filter((v): v is number => v !== undefined);
  const medianMs = percentile(lat, 50);
  const p95Ms = percentile(lat, 95);
  const enough = lat.length >= MIN_SAMPLES_FOR_VERDICT;
  return {
    mode,
    samples: lat.length,
    failures: rs.filter((r) => r.outcome === "failed").length,
    interrupted: rs.filter((r) => r.outcome === "interrupted").length,
    medianMs,
    p95Ms,
    medianVadDelayMs: percentile(nums("vadDelayMs"), 50),
    medianAnimationMs: percentile(nums("endToAnimationMs"), 50),
    overTarget: lat.filter((v) => v > TARGET_P95_MS).length,
    // Demo-mode numbers never count as evidence for the live target.
    meetsTarget: mode === "live" && enough ? medianMs! <= TARGET_MEDIAN_MS && p95Ms! <= TARGET_P95_MS : null,
  };
}
