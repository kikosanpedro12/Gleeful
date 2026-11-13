import "server-only";
import { TASTE_ID_RE, TASTE_MAX_INPUT, type TasteRequest } from "../protocol";
import { TASTE_LIMITS } from "./config";
import { cleanText } from "@/lib/scene/commands";

/** Visitor text: control characters out, angle brackets out (so it can never close our tags), capped. */
export function cleanVisitorText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  return cleanText(v.replace(/[<>]/g, " "), max);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseTasteRequest(v: unknown): { ok: true; req: TasteRequest } | { ok: false } {
  if (!isObj(v) || v.v !== 1) return { ok: false };
  if (typeof v.tasteId !== "string" || !TASTE_ID_RE.test(v.tasteId)) return { ok: false };
  const text = cleanVisitorText(v.text, TASTE_MAX_INPUT);
  if (!text) return { ok: false };
  if (v.history !== undefined && !Array.isArray(v.history)) return { ok: false };
  const raw: unknown[] = Array.isArray(v.history) ? v.history : [];
  if (raw.length > TASTE_LIMITS.maxHistory) return { ok: false };
  const history: TasteRequest["history"] = [];
  for (const h of raw) {
    if (!isObj(h) || (h.role !== "visitor" && h.role !== "teacher")) return { ok: false };
    const t = cleanVisitorText(h.text, TASTE_LIMITS.maxHistoryChars);
    if (!t) return { ok: false };
    history.push({ role: h.role, text: t });
  }
  return { ok: true, req: { v: 1, tasteId: v.tasteId, text, history } };
}
