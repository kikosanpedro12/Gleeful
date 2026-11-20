import { WORLDS } from "@/lib/worlds/registry";
import { parseSceneCommand, parseToolCall } from "@/lib/scene/commands";
import { contextFor } from "@/lib/worlds/registry";
import { runSample } from "./core";
import { SAFETY } from "./cases/safety";
import { FORMAT } from "./cases/format";
import { HONESTY } from "./cases/honesty";
import { ACCURACY } from "./cases/accuracy";
import { COMMAND_CASES } from "./cases/commands";
import { dataChecks } from "./suites/data";
import type { EvalCase, Result, Surface } from "./types";

export const CASES: EvalCase[] = [...SAFETY, ...FORMAT, ...HONESTY, ...ACCURACY];

export function commandResults(): Result[] {
  return COMMAND_CASES.map((c) => {
    const ctx = contextFor(c.world);
    const r = typeof c.args === "string" ? parseToolCall(String(c.name), c.args, ctx) : parseSceneCommand(c.name, c.args, ctx);
    const pass = r.ok === c.ok;
    return { id: c.id, area: "commands" as const, pass, problems: pass ? [] : [c.ok ? `should be accepted but: ${(r as { error: string }).error}` : "hostile/invalid command was ACCEPTED"] };
  });
}

export function caseResults(): Result[] {
  const out: Result[] = [];
  const ids = new Set<string>();
  for (const c of CASES) {
    const dup = ids.has(c.id); ids.add(c.id);
    const surfaces: Surface[] = c.surfaces ?? ["taste", "lesson"];
    const meta: string[] = [];
    if (dup) meta.push("duplicate case id");
    if (!c.good?.length && !c.neutralised?.length) meta.push("case has no good or neutralised sample");
    if (!c.prompt.trim()) meta.push("case has no prompt");
    for (const f of c.facts ?? []) {
      const w = WORLDS[f.world]; const fact = w.facts.find((x) => x.id === f.id);
      if (!fact) meta.push(`cites unknown fact ${f.world}.${f.id}`); else if (!w.sources.some((s) => s.id === fact.sourceId)) meta.push(`fact ${f.id} has no source`);
    }
    out.push({ id: `${c.id}/definition`, area: c.area, pass: meta.length === 0, problems: meta });
    for (const kind of ["good", "neutralised", "bad"] as const) {
      (c[kind] ?? []).forEach((s, i) => {
        for (const surface of (s.surfaces ?? surfaces)) {
          const r = runSample(c, kind, s, surface);
          out.push({ id: `${c.id}/${kind}#${i + 1}/${surface}`, area: c.area, pass: r.pass, problems: r.problems, note: r.note });
        }
      });
    }
  }
  return out;
}

export const allResults = (): Result[] => [...caseResults(), ...commandResults(), ...dataChecks()];
