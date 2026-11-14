import "server-only";
/** Validation of the browser's request. Anything unexpected is rejected, nothing is echoed back. */
import { ID_RE, SNAKE_RE, type BrainRequest, type WireInput, type WireSkillStatus } from "../protocol";
import { LIMITS } from "./config";
import { cleanText } from "@/lib/scene/commands";
import { parseValue, WIDGET_KINDS } from "@/lib/widgets/spec";
import { contextFor, isWorldId, WORLDS, type WorldId } from "@/lib/worlds/registry";

const SKILL_RE = /^(?=.{3,80}$)[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$/;
const STATUSES: readonly WireSkillStatus[] = ["not_seen", "learning", "needs_check", "independent"];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Child-controlled text: plain, bounded, and unable to close or open a prompt tag. */
export function childText(v: unknown, max: number = LIMITS.maxTextChars): string | null {
  const t = cleanText(v, max);
  if (!t) return null;
  return t.replace(/[<>`]/g, " ").replace(/\s+/g, " ").trim() || null;
}

export type Parsed = { ok: true; req: BrainRequest } | { ok: false; field: string };
const bad = (field: string): Parsed => ({ ok: false, field });

export function parseRequest(raw: unknown): Parsed {
  if (!isObj(raw)) return bad("body");
  if (raw.v !== 1) return bad("v");
  if (typeof raw.learnerId !== "string" || !ID_RE.test(raw.learnerId)) return bad("learnerId");
  if (typeof raw.sessionId !== "string" || !ID_RE.test(raw.sessionId)) return bad("sessionId");
  if (typeof raw.tz !== "string" || raw.tz.length > 64) return bad("tz");
  const world = raw.world;
  if (world !== "transit" && !isWorldId(world)) return bad("world");
  if (raw.teacher !== "leo" && raw.teacher !== "mia") return bad("teacher");
  if (typeof raw.session !== "number" || !Number.isInteger(raw.session) || raw.session < 0 || raw.session > 100000) return bad("session");
  if (typeof raw.hintsUsed !== "number" || !Number.isInteger(raw.hintsUsed) || raw.hintsUsed < 0 || raw.hintsUsed > 5) return bad("hintsUsed");
  const ctx = contextFor(world as WorldId | "transit");

  const input = parseInput(raw.input, ctx);
  if (!input) return bad("input");

  if (!Array.isArray(raw.history) || raw.history.length > LIMITS.maxHistoryTurns) return bad("history");
  const history: BrainRequest["history"] = [];
  for (const h of raw.history) {
    if (!isObj(h) || (h.role !== "child" && h.role !== "teacher")) return bad("history");
    const text = childText(h.text);
    if (!text) continue;
    history.push({ role: h.role, text });
  }

  if (!Array.isArray(raw.skills) || raw.skills.length > LIMITS.maxSkills) return bad("skills");
  const skills: BrainRequest["skills"] = [];
  for (const s of raw.skills) {
    if (!isObj(s) || typeof s.skill !== "string" || !SKILL_RE.test(s.skill) || !STATUSES.includes(s.status as WireSkillStatus)) return bad("skills");
    skills.push({ skill: s.skill, status: s.status as WireSkillStatus });
  }

  return {
    ok: true,
    req: {
      v: 1, learnerId: raw.learnerId, sessionId: raw.sessionId, tz: raw.tz,
      world: world as WorldId | "transit", teacher: raw.teacher, session: raw.session,
      input, hintsUsed: raw.hintsUsed, history, skills,
    },
  };
}

function parseInput(v: unknown, ctx: ReturnType<typeof contextFor>): WireInput | null {
  if (!isObj(v)) return null;
  switch (v.kind) {
    case "text": { const text = childText(v.text); return text ? { kind: "text", text } : null; }
    case "session_start": return { kind: "session_start" };
    case "resume": return { kind: "resume" };
    case "transit_cruise": return isWorldId(v.to) ? { kind: "transit_cruise", to: v.to } : null;
    case "world_ready": return isWorldId(v.world) ? { kind: "world_ready", world: v.world } : null;
    case "tap": {
      if (typeof v.target !== "string" || !SNAKE_RE.test(v.target)) return null;
      return ctx.interactive.includes(v.target) || ctx.targets.includes(v.target) ? { kind: "tap", target: v.target } : null;
    }
    case "choice": {
      const label = childText(v.label, 48);
      if (typeof v.id !== "string" || !/^[a-z0-9_]{1,32}$/.test(v.id) || !label) return null;
      return { kind: "choice", id: v.id, label };
    }
    case "answer": {
      if (typeof v.questionId !== "string" || typeof v.optionId !== "string") return null;
      if (!ctx.questions.includes(v.questionId)) return null;
      const q = ctx.world === "transit" ? undefined : WORLDS[ctx.world].questions[v.questionId];
      if (!q || !q.options.some((o) => o.id === v.optionId)) return null;
      return { kind: "answer", questionId: v.questionId, optionId: v.optionId };
    }
    case "widget": {
      if (ctx.world === "transit") return null;
      if (typeof v.widget !== "string" || !(WIDGET_KINDS as readonly string[]).includes(v.widget)) return null;
      if (parseValue(v.value) === null) return null;
      if (v.target !== undefined && parseValue(v.target) === null) return null;
      return { kind: "widget", widget: v.widget as (typeof WIDGET_KINDS)[number], value: String(v.value).trim(), ...(v.target !== undefined ? { target: String(v.target).trim() } : {}) };
    }
    default: return null;
  }
}
