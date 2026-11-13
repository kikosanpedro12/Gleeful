/**
 * The wire format between the landing page's "ask the teacher" box and /api/taste.
 * Types and plain constants only: safe to import from client code. The server re-validates everything.
 */
export const TASTE_ENDPOINT = "/api/taste";
/** The visitor gets this many questions, then is pointed at the full lesson. The server enforces it; the UI only mirrors it. */
export const TASTE_MAX_TURNS = 3;
/** Longest question accepted, in characters. */
export const TASTE_MAX_INPUT = 140;
export const TASTE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export interface TasteRequest {
  v: 1;
  /** Random per page view, chosen by the browser. Counts turns only; rotating it buys nothing (see the per-address caps). */
  tasteId: string;
  text: string;
  /** Up to the last two exchanges, so a follow-up makes sense. Untrusted: treated as data by the server. */
  history: { role: "visitor" | "teacher"; text: string }[];
}

export interface TasteResponse {
  reply: string;
  /** Questions this page view has left (0 = that was the last one). */
  turnsLeft: number;
}

export interface TasteStatus {
  /** True only if a question sent right now would really be answered by the model. */
  available: boolean;
  maxTurns: number;
}

export type TasteErrorCode =
  | "taste_unavailable" | "forbidden_origin" | "unsupported_media" | "too_large" | "bad_request"
  | "rate_limited" | "taste_over" | "taste_busy"
  | "upstream_failed" | "upstream_timeout" | "upstream_busy" | "bad_model_output";
