import "server-only";
import { loadAll } from "./load";
import type { Standard } from "./types";

const STOP = new Set("the a an and or of to in on is are was what why how do does can you me my i it this that for with about tell explain".split(" "));
const words = (s: string) => s.toLowerCase().match(/[a-z]{3,}/g)?.filter((w) => !STOP.has(w)) ?? [];

let cache: Standard[] | null = null;

/**
 * Up to `max` school standards related to what the child asked, as short reference lines.
 * It is background context for the model: it helps pitch the answer at the right level.
 * It never limits what the teacher may answer, and a child's question needs no match.
 */
export async function curriculumContext(childText: string, max = 5): Promise<string> {
  const q = new Set(words(childText));
  if (q.size === 0) return "";
  cache ??= await loadAll();
  const scored: { s: Standard; n: number }[] = [];
  for (const s of cache) {
    let n = 0;
    for (const w of words(`${s.domain} ${s.text}`)) if (q.has(w)) n++;
    if (n >= 2 || (n === 1 && q.size === 1)) scored.push({ s, n });
  }
  scored.sort((a, b) => b.n - a.n);
  const top = scored.slice(0, max);
  if (!top.length) return "";
  return top.map(({ s }) => `- grade ${s.grade} ${s.subject} (${s.fw}${s.fw === "deped-matatag" ? ", unverified summary" : ""}): ${s.text.slice(0, 160)}`).join("\n");
}
