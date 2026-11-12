/**
 * ClaudeBrain: the browser side of the model brain. It never sees the API key;
 * it sends a small, structured request to /api/brain and gets back the same
 * { segments } shape the scripted brain returns. Anything wrong (offline, over
 * a limit, bad output) throws BrainUnavailable so FallbackBrain can use the
 * script instead.
 *
 * Learner evidence is recorded HERE, by code, from the question data: the
 * model never decides whether an answer was right and never writes evidence.
 */
import type { Action, Brain, BrainContext, BrainInput, BrainReply, Segment } from "./types";
import { BRAIN_ENDPOINT, type BrainRequest, type BrainResponse, type WireInput } from "./protocol";
import { skillStatus } from "@/lib/learner/profile";
import { WORLDS } from "@/lib/worlds/registry";

export class BrainUnavailable extends Error {
  constructor(public code: string, public status = 0) { super(code); }
}

const MAX_HISTORY = 8;
const CLIENT_TIMEOUT_MS = 14_000;

function zone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila"; } catch { return "Asia/Manila"; }
}
function newId(): string {
  try { return crypto.randomUUID(); } catch { return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; }
}

export function toWire(input: BrainInput): WireInput {
  switch (input.kind) {
    case "text": return { kind: "text", text: input.text.slice(0, 300) };
    case "choice": return { kind: "choice", id: input.id, label: input.label.slice(0, 48) };
    default: return input;
  }
}

/** Defence in depth: the server already cleaned this, but a bad reply must never reach the lesson. */
export function checkReply(v: unknown): BrainReply {
  const segs = (v as BrainResponse | null)?.segments;
  if (!Array.isArray(segs) || segs.length < 1 || segs.length > 4) throw new BrainUnavailable("bad_shape");
  const out: Segment[] = [];
  for (const s of segs) {
    if (!s || typeof s.say !== "string" || !s.say.trim() || s.say.length > 400) throw new BrainUnavailable("bad_shape");
    const actions: Action[] = [];
    for (const a of s.actions ?? []) {
      if (!a || typeof a.name !== "string" || typeof a.args !== "object" || a.args === null || Array.isArray(a.args)) throw new BrainUnavailable("bad_shape");
      actions.push({ name: a.name, args: a.args });
    }
    out.push(actions.length ? { say: s.say, actions } : { say: s.say });
  }
  return { segments: out };
}

export class ClaudeBrain implements Brain {
  readonly kind = "model" as const;
  private sessionId = newId();
  private history: BrainRequest["history"] = [];
  /** Questions the model has put on screen and the child has not finished, with hints given so far. */
  private open = new Map<string, number>();

  constructor(private opts: { fetchImpl?: typeof fetch; endpoint?: string; timeoutMs?: number } = {}) {}

  async respond(input: BrainInput, ctx: BrainContext): Promise<BrainReply> {
    const wire = toWire(input);
    const answer = input.kind === "answer" ? this.judge(input, ctx) : null;
    const req: BrainRequest = {
      v: 1,
      learnerId: ctx.profile.learnerId,
      sessionId: this.sessionId,
      tz: zone(),
      world: ctx.world,
      teacher: ctx.teacher,
      session: ctx.session,
      input: wire,
      hintsUsed: answer?.prior ?? 0,
      history: this.history.slice(-MAX_HISTORY),
      skills: [...new Set(ctx.profile.attempts.map((a) => a.skill))].slice(0, 10).map((skill) => ({ skill, status: skillStatus(ctx.profile.attempts, skill).kind })),
    };

    const reply = await this.call(req);

    // Only after a good reply (so a failed call that falls back to the script cannot record twice).
    const evidence = answer?.after();
    if (evidence) ctx.record(evidence);
    for (const s of reply.segments) for (const a of s.actions ?? []) {
      if (a.name === "askQuestion" && typeof a.args.questionId === "string" && !this.open.has(a.args.questionId)) this.open.set(a.args.questionId, 0);
    }
    if (input.kind === "text") this.push("child", input.text);
    else if (input.kind === "choice") this.push("child", input.label);
    for (const s of reply.segments) this.push("teacher", s.say);
    return reply;
  }

  private push(role: "child" | "teacher", text: string) {
    this.history.push({ role, text: text.slice(0, 300) });
    if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY);
  }

  /**
   * Deterministic answer bookkeeping, the same rules the scripted lesson uses: a
   * first miss is a hint and a retry (not recorded); a hit or a second miss is
   * recorded. A stale card (question not open) is never recorded. `prior` is how
   * many wrong answers came before this one; `after` applies the result once the
   * model's reply has arrived (so a failed call that falls back cannot double-count).
   */
  private judge(input: Extract<BrainInput, { kind: "answer" }>, ctx: BrainContext) {
    if (ctx.world === "transit") return null;
    const questions = WORLDS[ctx.world].questions;
    const q = Object.hasOwn(questions, input.questionId) ? questions[input.questionId] : undefined;
    const opt = q?.options.find((o) => o.id === input.optionId);
    if (!q || !opt || !this.open.has(q.id)) return null;
    const prior = this.open.get(q.id) ?? 0;
    const after = () => {
      if (!opt.correct && prior === 0) { this.open.set(q.id, 1); return null; }
      this.open.delete(q.id);
      const all = ctx.profile.attempts.filter((a) => a.skill === q.skill);
      const earlier = all.some((a) => a.session !== undefined && a.session < ctx.session);
      const context = prior > 0 ? "taught" : earlier ? "later_check" : all.length ? "recheck" : "taught";
      return { skill: q.skill, questionId: q.id, answerId: opt.id, correct: opt.correct, hintsUsed: prior, context } as const;
    };
    return { prior, after };
  }

  private async call(req: BrainRequest): Promise<BrainReply> {
    const f = this.opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.opts.timeoutMs ?? CLIENT_TIMEOUT_MS);
    try {
      const res = await f(this.opts.endpoint ?? BRAIN_ENDPOINT, {
        method: "POST", signal: ctl.signal, credentials: "same-origin",
        headers: { "content-type": "application/json" }, body: JSON.stringify(req),
      });
      if (!res.ok) {
        let code = "http_error";
        try { const j = (await res.json()) as { error?: unknown }; if (typeof j.error === "string") code = j.error.slice(0, 40); } catch { /* keep default */ }
        throw new BrainUnavailable(code, res.status);
      }
      return checkReply(await res.json());
    } catch (e) {
      if (e instanceof BrainUnavailable) throw e;
      throw new BrainUnavailable(e instanceof Error && e.name === "AbortError" ? "timeout" : "network");
    } finally {
      clearTimeout(timer);
    }
  }
}
