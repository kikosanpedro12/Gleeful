/**
 * learners.interests and learners.name_say: real migrations on real Postgres (PGlite).
 * Run by `npm run mutate`: every weakening of 20261123064826_learner_interests_name_say.sql must turn this red.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MIGRATIONS = process.env.MIGRATIONS_DIR || path.join(ROOT, "supabase/migrations");
const A = "00000000-0000-4000-8000-0000000000d1";
const B = "00000000-0000-4000-8000-0000000000d2";
let db: PGlite;
type Who = "anon" | "authenticated" | "service_role";
async function as<T = Record<string, unknown>>(role: Who, uid: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
    await tx.query(`set local role ${role}`);
    return (await tx.query<T>(sql, params)).rows;
  });
}
async function refused(p: Promise<unknown>, re?: RegExp) {
  let err: unknown = null;
  try { await p; } catch (e) { err = e; }
  expect(err, "expected the database to refuse").not.toBeNull();
  if (re) expect(String((err as Error).message)).toMatch(re);
}
const INS = `insert into public.learners (parent_id, nickname, grade, interests, name_say) values ($1, 'Kid', 3, $2::text[], $3) returning id`;
const ALL = ["animals", "dinosaurs", "ocean", "nature", "space", "robots", "vehicles", "building", "football", "basketball", "art", "music_dance", "stories", "superheroes", "cooking", "games_puzzles", "experiments"];
let idA = "";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "tests/db/supabase-stub.sql"), "utf8"));
  for (const f of fs.readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
  await db.query(`insert into auth.users (id, email) values ($1, 'a@d.test'), ($2, 'b@d.test')`, [A, B]);
  idA = (await as<{ id: string }>("authenticated", A, INS, [A, ["space", "music_dance"], "GAD-dee"]))[0].id;
}, 60_000);

describe("interests", () => {
  it("defaults to empty and null; a parent can store valid values", async () => {
    const r = await as<{ interests: string[]; name_say: string | null }>("authenticated", A, `insert into public.learners (parent_id, nickname, grade) values ($1, 'Plain', 1) returning interests, name_say`, [A]);
    expect(r[0]).toEqual({ interests: [], name_say: null });
    expect((await as<{ interests: string[] }>("authenticated", A, `select interests from public.learners where id = $1`, [idA]))[0].interests).toEqual(["space", "music_dance"]);
  });
  it("every id on the fixed list is accepted (5 at a time)", async () => {
    for (let i = 0; i < ALL.length; i++) {
      const five = [0, 1, 2, 3, 4].map((k) => ALL[(i + k * 3) % ALL.length]);
      if (new Set(five).size === 5) await as("authenticated", A, INS, [A, five, null]);
    }
    await as("authenticated", A, INS, [A, ALL.slice(0, 5), null]);
  });
  it("six items are refused; five are fine", async () => {
    await refused(as("authenticated", A, INS, [A, ALL.slice(0, 6), null]), /learners_interests_check/);
  });
  it("an unknown item, a different case, an empty string, or a null element is refused", async () => {
    for (const bad of [["minecraft"], ["Space"], ["space", "evil"], [""], ["space", null]])
      await refused(as("authenticated", A, `insert into public.learners (parent_id, nickname, grade, interests) values ($1, 'K', 3, $2::text[])`, [A, bad]), /learners_interests_check/);
  });
  it("a duplicate is refused wherever it sits", async () => {
    for (const bad of [["space", "space"], ["space", "art", "space"], ["art", "robots", "ocean", "art"], ["art", "robots", "ocean", "nature", "nature"], ["art", "robots", "robots", "nature", "space"]])
      await refused(as("authenticated", A, INS, [A, bad, null]), /learners_interests_check/);
  });
  it("a two-dimensional array is refused", async () => {
    await refused(as("authenticated", A, `insert into public.learners (parent_id, nickname, grade, interests) values ($1, 'K', 3, '{{space,art},{robots,ocean}}')`, [A]), /learners_interests_check/);
  });
  it("an update runs through the same checks", async () => {
    await refused(as("authenticated", A, `update public.learners set interests = $1::text[] where id = $2`, [["space", "space"], idA]), /learners_interests_check/);
    await refused(as("authenticated", A, `update public.learners set interests = $1::text[] where id = $2`, [["bad"], idA]), /learners_interests_check/);
    expect(await as("authenticated", A, `update public.learners set interests = $1::text[], name_say = null where id = $2 returning id`, [["art"], idA])).toHaveLength(1);
    await as("authenticated", A, `update public.learners set interests = $1::text[], name_say = 'GAD-dee' where id = $2`, [["space", "music_dance"], idA]);
  });
});

describe("name_say", () => {
  it("accepts letters, spaces, hyphens and apostrophes", async () => {
    for (const ok of ["GAD-dee", "Mary Ann", "O'NEEL", "a", "x".repeat(40)]) await as("authenticated", A, INS, [A, [], ok]);
  });
  it("refuses empty, too long, digits, symbols, markup and a leading hyphen", async () => {
    for (const bad of ["", "x".repeat(41), "Gaddi2", "a_b", "<b>x</b>", "a.b", "-ab", " ab", "a\nb", "https://x.co"])
      await refused(as("authenticated", A, INS, [A, [], bad]), /learners_name_say_check/);
  });
});

describe("access: still the parent's own rows only", () => {
  it("B cannot read A's interests or name, by id or by column", async () => {
    expect(await as("authenticated", B, `select interests, name_say from public.learners where id = $1`, [idA])).toEqual([]);
    expect(await as("authenticated", B, `select interests, name_say from public.learners`)).toEqual([]);
  });
  it("B's update of A's learner changes nothing; B cannot insert for A", async () => {
    expect(await as("authenticated", B, `update public.learners set interests = '{art}', name_say = 'hacked' where id = $1 returning id`, [idA])).toEqual([]);
    await refused(as("authenticated", B, INS, [A, ["art"], null]), /row-level security/);
    const row = (await db.query<{ name_say: string }>(`select name_say from public.learners where id = $1`, [idA])).rows[0];
    expect(row.name_say).toBe("GAD-dee");
  });
  it("anonymous visitors cannot read or write the new columns", async () => {
    await refused(as("anon", null, `select interests from public.learners`), /permission denied/);
    await refused(as("anon", null, `update public.learners set name_say = 'x'`), /permission denied/);
  });
  it("the update grant covers exactly the two new columns more: ownership and ids stay locked", async () => {
    for (const col of ["parent_id = parent_id", "id = gen_random_uuid()", "created_at = now()"])
      await refused(as("authenticated", A, `update public.learners set ${col} where id = $1`, [idA]), /permission denied/);
  });
});
