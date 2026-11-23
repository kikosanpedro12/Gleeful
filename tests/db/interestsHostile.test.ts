/** Tester additions: hostile name_say / interests values against real Postgres (PGlite). */
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MIGRATIONS = process.env.MIGRATIONS_DIR || path.join(ROOT, "supabase/migrations");
const A = "00000000-0000-4000-8000-0000000000e1";
let db: PGlite;
async function asA(sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [A]);
    await tx.query(`set local role authenticated`);
    return (await tx.query<Record<string, unknown>>(sql, params)).rows;
  });
}
const refused = async (p: Promise<unknown>) => { let e: unknown = null; try { await p; } catch (x) { e = x; } expect(e).not.toBeNull(); };
const NAME = `insert into public.learners (parent_id, nickname, grade, name_say) values ($1, 'K', 3, $2) returning name_say`;
const INT = `insert into public.learners (parent_id, nickname, grade, interests) values ($1, 'K', 3, $2::text[]) returning interests`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "tests/db/supabase-stub.sql"), "utf8"));
  for (const f of fs.readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
  await db.query(`insert into auth.users (id, email) values ($1, 'e@d.test')`, [A]);
}, 60_000);

describe("name_say hostile values", () => {
  const bad = ["Gaddi\n", "Gaddi\r", "\nGaddi", "Gaddi\t", "Gaddi\u0000", "Ga​ddi", "Gäddi", "Гaddi", "Ｇaddi", "日本", "😀", "á", "x'; drop table learners;--", "a\\b", "a%b", "a/b", "A B", "A B", "'start", "a".repeat(41), "a".repeat(10000)];
  for (const v of bad) it(`refuses ${JSON.stringify(v.slice(0, 20))}`, async () => { await refused(asA(NAME, [A, v])); });
  it("stores an SQL-ish but valid-charset value verbatim (parameterised)", async () => {
    expect((await asA(NAME, [A, "Robert' OR 'x'-'y"]))[0].name_say).toBe("Robert' OR 'x'-'y");
    expect(Number((await db.query<{ n: string }>(`select count(*) n from public.learners`)).rows[0].n)).toBeGreaterThan(0);
  });
});

describe("interests hostile values", () => {
  const bad: unknown[][] = [["space\n"], [" space"], ["space "], ["spaçe"], ["ѕpace"], ["space", "SPACE"], ["'; drop table learners;--"], ["__proto__"], ["{space}"], ["space,art"], ["%"], ["a".repeat(5000)], [null]];
  for (const v of bad) it(`refuses ${JSON.stringify(v).slice(0, 30)}`, async () => { await refused(asA(INT, [A, v])); });
  it("refuses a 3-D array literal and a NULL interests column", async () => {
    await refused(asA(`insert into public.learners (parent_id, nickname, grade, interests) values ($1,'K',3,'{{{space}}}')`, [A]));
    await refused(asA(`insert into public.learners (parent_id, nickname, grade, interests) values ($1,'K',3,null)`, [A]));
  });
  it("refuses an offset-lower-bound array that hides items", async () => {
    // [0:1]={space,art}: ndims is 1, so the check must still hold for the real contents.
    const r = await asA(`insert into public.learners (parent_id, nickname, grade, interests) values ($1,'K',3,'[0:5]={space,art,robots,ocean,stories,cooking}'::text[]) returning interests`, [A]).catch(() => "refused");
    expect(r).toBe("refused");
  });
  it("refuses custom array bounds that skip the duplicate check", async () => {
    let msg = "";
    try { await asA(INT, [A, "[5:6]={space,space}"]); } catch (x) { msg = String((x as Error).message); }
    expect(msg).toContain("learners_interests_check");
  });
});
