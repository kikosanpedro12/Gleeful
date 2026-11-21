/**
 * Client-safe re-check of a chalkboard phrase from /api/taste. The server already sanitises it; the browser does not
 * trust that. Anything that looks like markup, a link, a contact detail or a long number is refused (no board change).
 * Pure: safe on client and server.
 */
import { BOARD_MAX, CHOICE_MAX, CHOICES_MAX, TOPIC_MAX } from "./protocol";

const BAD = /[<>{}\[\]\\|`]|@|\d{5,}|\d[\d\s-]{6,}\d|https?:|www\.|\b\w+\.(com|net|org|io|co|ly|me|app|ph|gov|edu|info|xyz)\b|\bdot\s*(com|net|org)\b/i;

const CONTROLS = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]");

/** A short plain phrase: no markup, links, handles, long numbers or control characters. */
export function plainOk(v: unknown, max: number): v is string {
  if (typeof v !== "string") return false;
  const t = v.trim();
  return t.length > 0 && t === v && Array.from(t).length <= max && !BAD.test(t) && !CONTROLS.test(t);
}
export const boardOk = (v: unknown): v is string => typeof v === "string" && plainOk(v.trim(), BOARD_MAX);
export const topicOk = (v: unknown): v is string => plainOk(v, TOPIC_MAX);

/** The tutor's tap answers: exactly 2 (the model was asked for 2; 1 is allowed too), each a plain short phrase, no duplicates. Anything else = none. */
export function choicesOk(v: unknown): v is string[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > CHOICES_MAX) return false;
  if (!v.every((c) => plainOk(c, CHOICE_MAX))) return false;
  return new Set(v.map((c: string) => c.toLowerCase())).size === v.length;
}
