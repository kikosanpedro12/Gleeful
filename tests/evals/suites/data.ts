/** Pedagogy and accuracy checks over the lesson data itself (src/lib/worlds/registry.ts). New worlds and questions are covered automatically. */
import { WORLDS, WORLD_IDS, type WorldId } from "@/lib/worlds/registry";
import { buildUserMessage } from "@/lib/brain/server/prompt";
import { toolsFor } from "@/lib/scene/commands";
import { contextFor } from "@/lib/worlds/registry";
import type { BrainRequest } from "@/lib/brain/protocol";
import type { Result } from "../types";

const isRecall = (id: string) => /recall/.test(id);
const req = (world: WorldId, questionId: string, optionId: string, hintsUsed: number): BrainRequest => ({
  v: 1, learnerId: "eval", sessionId: "eval", tz: "Asia/Manila", world, teacher: "leo", session: 1,
  input: { kind: "answer", questionId, optionId }, hintsUsed, history: [], skills: [],
});

type Check = { id: string; area: "pedagogy" | "accuracy"; problems: string[] };

export function dataChecks(): Result[] {
  const checks: Check[] = [];
  const add = (id: string, area: Check["area"], problems: string[]) => checks.push({ id, area, problems });

  // recall checks: every skill taught by a guided question must have an unassisted recall question somewhere.
  const recallSkills = new Set<string>();
  for (const w of Object.values(WORLDS)) for (const q of Object.values(w.questions)) if (isRecall(q.id)) recallSkills.add(q.skill);

  for (const wid of WORLD_IDS) {
    const w = WORLDS[wid];
    for (const q of Object.values(w.questions)) {
      const P: string[] = [];
      const correct = q.options.filter((o) => o.correct);
      const wrong = q.options.filter((o) => !o.correct);
      if (q.options.length < 3) P.push("fewer than 3 options");
      if (correct.length !== 1) P.push(`${correct.length} correct options (need exactly 1)`);
      if (wrong.length < 2) P.push("fewer than 2 misconception options");
      for (const o of wrong) if (!o.keywords.length) P.push(`misconception option ${o.id} has no keywords (spoken answers cannot match it)`);
      if (!correct[0]?.keywords.length) P.push("correct option has no keywords");
      const seen = new Map<string, string>();
      for (const o of q.options) for (const k of o.keywords) { if (seen.has(k) && seen.get(k) !== o.id) P.push(`keyword ${k} is on options ${seen.get(k)} and ${o.id}`); seen.set(k, o.id); }
      if (!q.explain.trim()) P.push("no explanation");
      if (!q.skill.trim()) P.push("no skill id");
      if (!q.prompt.trim()) P.push("no prompt");
      if (isRecall(q.id)) { if (q.hint !== "") P.push("a recall check must be unassisted (empty hint)"); }
      else if (!q.hint.trim()) P.push("no hint for a guided question");
      if (!isRecall(q.id) && !recallSkills.has(q.skill)) P.push(`skill ${q.skill} has no recall check question`);
      if (q.hint && correct[0] && q.hint.toLowerCase().includes(`is ${correct[0].label.toLowerCase()}.`)) P.push("hint gives the answer away");
      add(`pedagogy.${wid}.${q.id}.structure`, "pedagogy", P);

      // hint before answer, driven by the real prompt builder
      const Q: string[] = [];
      for (const o of wrong) {
        const first = buildUserMessage(req(wid, q.id, o.id, 0));
        const second = buildUserMessage(req(wid, q.id, o.id, 1));
        if (!/NOT correct/.test(first)) Q.push(`first miss (${o.id}) not marked NOT correct`);
        if (q.hint && !first.includes(q.hint)) Q.push(`first miss (${o.id}) does not carry the hint`);
        if (first.includes(q.explain)) Q.push(`first miss (${o.id}) gives the full explanation before the hint`);
        if (!/askQuestion/.test(first)) Q.push(`first miss (${o.id}) does not ask for the question again`);
        if (!second.includes(q.explain)) Q.push(`second miss (${o.id}) does not carry the explanation`);
        if (/with askQuestion/.test(second) || !/Do not ask the same question again/.test(second)) Q.push(`second miss (${o.id}) may re-ask the same question`);
      }
      for (const o of correct) {
        const m = buildUserMessage(req(wid, q.id, o.id, 0));
        if (/NOT correct/.test(m) || !/CORRECT/.test(m)) Q.push("correct answer not marked CORRECT");
        if (!/own words/.test(m)) Q.push("correct answer does not ask the child to explain in their own words");
      }
      add(`pedagogy.${wid}.${q.id}.hint_before_answer`, "pedagogy", Q);
    }
    // the model may only be offered questions the world declares
    const tool = toolsFor(contextFor(wid)).find((t) => t.name === "askQuestion") as { input_schema: { properties: { questionId: { enum: string[] } } } } | undefined;
    const offered = tool?.input_schema.properties.questionId.enum ?? [];
    add(`pedagogy.${wid}.tool_offers_only_declared_questions`, "pedagogy", JSON.stringify(offered) === JSON.stringify(Object.keys(w.questions)) ? [] : [`offered ${offered}`]);

    // accuracy: every fact carries a source that exists
    const A: string[] = [];
    const sourceIds = new Set(w.sources.map((s) => s.id));
    const factIds = new Set<string>();
    if (w.facts.length && !w.sources.length) A.push("facts but no sources");
    for (const f of w.facts) {
      if (factIds.has(f.id)) A.push(`duplicate fact id ${f.id}`);
      factIds.add(f.id);
      if (!f.text.trim()) A.push(`fact ${f.id} has no text`);
      if (!f.sourceId || !sourceIds.has(f.sourceId)) A.push(`fact ${f.id} has no source id that resolves (${f.sourceId})`);
    }
    for (const s of w.sources) { if (!/^https:\/\//.test(s.url)) A.push(`source ${s.id} url is not https`); if (!s.title.trim()) A.push(`source ${s.id} has no title`); }
    for (const [k, it] of Object.entries(w.interactive)) for (const id of it.inspect.factIds) if (!factIds.has(id)) A.push(`${k}: inspect cites unknown fact ${id}`);
    for (const [k, it] of Object.entries(w.interactive)) if (!it.inspect.factIds.length) A.push(`${k}: inspect text cites no fact`);
    if (w.reviewStatus !== "reviewed" && w.reviewStatus !== "pending human review") A.push("bad reviewStatus");
    add(`accuracy.${wid}.every_fact_has_a_source`, "accuracy", A);
  }
  return checks.map((c) => ({ id: c.id, area: c.area, pass: c.problems.length === 0, problems: c.problems }));
}
