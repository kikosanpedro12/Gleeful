/**
 * Browser side of one landing-taste question: one POST, its answer reduced to a small tagged result.
 * Kept out of the React component so "the visitor left while the answer was pending" can be unit-tested.
 * Rule: after EVERY await the caller's `alive()` is checked; a left page gets `aborted` and nothing else, so the
 * component starts no speech, acts, board change or timer for a page that is gone. The server still counts the try.
 */
import { TASTE_ENDPOINT, TASTE_MAX_TURNS, type TasteRequest } from "./protocol";

export interface TasteReply {
  reply: string; left: number;
  scene?: unknown; gesture?: unknown; act?: unknown; board?: unknown; choices?: unknown; topic?: unknown;
}
export type TasteTurn =
  | { kind: "reply"; reply: TasteReply }
  | { kind: "over" }          // the server says this visitor's tries are used
  | { kind: "rate_limited" }
  | { kind: "busy" }          // out of budget for now (503, or 429 of another kind)
  | { kind: "trouble" }       // network error, bad status, empty or malformed answer
  | { kind: "aborted" };      // the visitor left (alive() false) or the request was cancelled

export async function askTaste(body: TasteRequest, opts: { signal: AbortSignal; alive: () => boolean; fetchImpl?: typeof fetch }): Promise<TasteTurn> {
  const f = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const gone = () => !opts.alive() || opts.signal.aborted;
  try {
    const res = await f(TASTE_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body), signal: opts.signal });
    if (gone()) return { kind: "aborted" };
    if (res.ok) {
      const j = (await res.json()) as Record<string, unknown>;
      if (gone()) return { kind: "aborted" };
      if (typeof j.reply !== "string" || !j.reply) return { kind: "trouble" };
      const left = typeof j.turnsLeft === "number" ? Math.max(0, Math.min(TASTE_MAX_TURNS, j.turnsLeft)) : 0;
      return { kind: "reply", reply: { reply: j.reply, left, scene: j.scene, gesture: j.gesture, act: j.act, board: j.board, choices: j.choices, topic: j.topic } };
    }
    if (res.status === 429 || res.status === 503) {
      const err = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (gone()) return { kind: "aborted" };
      if (err.error === "rate_limited") return { kind: "rate_limited" };
      if (err.error === "taste_over") return { kind: "over" };
      return { kind: "busy" };
    }
    return { kind: "trouble" };
  } catch {
    return gone() ? { kind: "aborted" } : { kind: "trouble" };
  }
}
