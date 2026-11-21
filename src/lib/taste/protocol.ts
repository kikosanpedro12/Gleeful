/**
 * The wire format between the landing page's "ask the teacher" box and /api/taste.
 * Types and plain constants only: safe to import from client code. The server re-validates everything.
 */
export const TASTE_ENDPOINT = "/api/taste";
/** The visitor gets this many questions, then is pointed at the full lesson. The server enforces it; the UI only mirrors it. */
export const TASTE_MAX_TURNS = 3;
/** Longest question accepted, in characters. */
export const TASTE_MAX_INPUT = 140;
/** Longest chalkboard phrase the landing tutor may write. */
export const BOARD_MAX = 40;
/** The tutor's 2 tap answers: at most this many, each at most CHOICE_MAX characters. */
export const CHOICES_MAX = 2;
export const CHOICE_MAX = 32;
/** A few words naming what the visitor explored (used by the paywall). */
export const TOPIC_MAX = 32;
export const TASTE_COOKIE = "gl_taste";
export const TASTE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export interface TasteRequest {
  v: 1;
  /** Random per page view, chosen by the browser. Counts turns only; rotating it buys nothing (see the per-address caps). */
  tasteId: string;
  text: string;
  /** Which tutor the visitor picked. Only changes the name the model speaks as. */
  teacher?: "leo" | "mia";
  /** Up to the last two exchanges, so a follow-up makes sense. Untrusted: treated as data by the server. */
  history: { role: "visitor" | "teacher"; text: string }[];
}

export interface TasteResponse {
  reply: string;
  /** Questions this page view has left (0 = that was the last one). */
  turnsLeft: number;
  /** An optional picture for the chalkboard: already validated by parseFrame on the server, re-validated by the client. */
  scene?: Record<string, unknown>;
  /** Optional body language and chalkboard text. Validated on the server and again in the browser. */
  gesture?: string;
  /** Optional whole-body action (jump, clap, sit...) allowed in the landing classroom. Validated on both sides. */
  act?: string;
  board?: string;
  /** Exactly 2 short answers the visitor can tap as the next question (validated on both sides). */
  choices?: string[];
  /** A few words naming the subject, for the paywall ("you just explored ..."). */
  topic?: string;
}

export interface TasteStatus {
  /** True only if a question sent right now would really be answered by the model. */
  available: boolean;
  maxTurns: number;
  /** Tries this browser has already used (from the signed cookie), so a refresh shows the right counter. */
  used?: number;
}

export type TasteErrorCode =
  | "taste_unavailable" | "forbidden_origin" | "unsupported_media" | "too_large" | "bad_request"
  | "rate_limited" | "taste_over" | "taste_busy"
  | "upstream_failed" | "upstream_timeout" | "upstream_busy" | "bad_model_output";
