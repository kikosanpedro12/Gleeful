/**
 * Client-safe re-check of a chalkboard phrase from /api/taste. The server already sanitises it; the browser does not
 * trust that. Anything that looks like markup, a link, a contact detail or a long number is refused (no board change).
 * Pure: safe on client and server.
 */
import { BOARD_MAX } from "./protocol";

const BAD = /[<>{}\[\]\\|`]|@|\d{5,}|\d[\d\s-]{6,}\d|https?:|www\.|\b\w+\.(com|net|org|io|co|ly|me|app|ph|gov|edu|info|xyz)\b|\bdot\s*(com|net|org)\b/i;

const CONTROLS = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]");

export function boardOk(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const t = v.trim();
  return t.length > 0 && Array.from(t).length <= BOARD_MAX && !BAD.test(t) && !CONTROLS.test(t);
}
