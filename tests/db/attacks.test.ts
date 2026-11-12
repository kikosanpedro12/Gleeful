/**
 * Tester attack suite (round 4): cross-family reads/writes, spoofed ids, bulk
 * statements without WHERE, anon + auth.uid(), and the attempts identity sequence.
 * Same harness as rls.test.ts: the REAL migration on PGlite, Supabase-like roles.
 * Supabase ALSO grants default privileges on SEQUENCES to the API roles; the
 * shared stub only mirrors tables, so this file adds the sequence default too.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MIGRATIONS = process.env.MIGRATIONS_DIR || path.join(ROOT, "supabase/migrations");
const A = "00000000-0000-4000-8000-0000000000aa";
const B = "00000000-0000-4000-8000-0000000000bb";
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
const count = async (t: string, where = "true", params: unknown[] = []) =>
  ((await db.query(`select count(*)::int as n from public.${t} where ${where}`, params)).rows[0] as { n: number }).n;

let lA = "", lA2 = "", lB = "", sA = "", sB = "";
const INS = `insert into public.attempts (learner_id, parent_id, session_id, skill, question_id, answer_id, correct, context)
             values ($1, $2, $3, 'science.mars.red_color', 'q_red', 'rust', true, 'taught') returning id`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "tests/db/supabase-stub.sql"), "utf8"));
  await db.exec(`alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;`);
  for (const f of fs.readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort())
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
  await db.query(`insert into auth.users (id, email) values ($1, 'a@x.test'), ($2, 'b@x.test')`, [A, B]);
  const L = `insert into public.learners (parent_id, nickname, grade) values ($1, $2, 3) returning id`;
  lA = (await as<{ id: string }>("authenticated", A, L, [A, "A1"]))[0].id;
  lA2 = (await as<{ id: string }>("authenticated", A, L, [A, "A2"]))[0].id;
  lB = (await as<{ id: string }>("authenticated", B, L, [B, "B1"]))[0].id;
  const S = `insert into public.lesson_sessions (learner_id, parent_id, teacher, brain) values ($1, $2, 'leo', 'scripted') returning id`;
  sA = (await as<{ id: string }>("authenticated", A, S, [lA, A]))[0].id;
  sB = (await as<{ id: string }>("authenticated", B, S, [lB, B]))[0].id;
  await as("authenticated", A, INS, [lA, A, sA]);
  await as("authenticated", B, INS, [lB, B, sB]);
  await as("service_role", null, `insert into public.brain_usage (learner_id, parent_id, turns) values ($1, $2, 7), ($3, $4, 9)`, [lA, A, lB, B]);
}, 60_000);

describe("cross-family reads", () => {
  it("A cannot read B's brain_usage, by id or in bulk", async () => {
    expect(await as("authenticated", A, `select * from public.brain_usage where learner_id = $1`, [lB])).toEqual([]);
    const all = await as<{ turns: number }>("authenticated", A, `select turns from public.brain_usage`);
    expect(all.map((r) => r.turns)).toEqual([7]);
  });
  it("joins and aggregates do not leak the other family (count(*) is RLS-filtered)", async () => {
    const r = await as<{ n: number }>("authenticated", A,
      `select count(*)::int n from public.attempts a join public.learners l on l.id = a.learner_id`);
    expect(r[0].n).toBe(1);
  });
});

describe("spoofed ids", () => {
  it("attempt with session_id NULL and parent_id spoofed to B, learner A's → refused", async () => {
    await refused(as("authenticated", A, INS, [lA, B, null]), /row-level security|foreign key/);
  });
  it("attempt with session_id NULL, parent_id B, learner B (B's family) written by A → refused by RLS", async () => {
    await refused(as("authenticated", A, INS, [lB, B, null]), /row-level security/);
  });
  it("attempt with session_id NULL, parent_id A, learner B → refused by composite FK", async () => {
    await refused(as("authenticated", A, INS, [lB, A, null]), /foreign key/);
  });
});

describe("re-pointing rows", () => {
  it("A cannot move its session onto B's learner (with or without parent change)", async () => {
    await refused(as("authenticated", A, `update public.lesson_sessions set learner_id = $1 where id = $2`, [lB, sA]), /foreign key|row-level|permission denied/);
    await refused(as("authenticated", A, `update public.lesson_sessions set learner_id = $1, parent_id = $2 where id = $3`, [lB, B, sA]), /row-level security|permission denied/);
  });
  it("A cannot move a session that has evidence to its OTHER child (evidence would change child)", async () => {
    await refused(as("authenticated", A, `update public.lesson_sessions set learner_id = $1 where id = $2`, [lA2, sA]), /foreign key|permission denied/);
  });
  it("A cannot re-parent B's session (refused: parent_id is not an updatable column)", async () => {
    await refused(as("authenticated", A, `update public.lesson_sessions set parent_id = $1 where id = $2 returning id`, [A, sB]), /permission denied|row-level/);
  });
  it("A cannot change a learner id to steal B's learner id (PK/unique clash or RLS)", async () => {
    await refused(as("authenticated", A, `update public.learners set id = $1 where id = $2`, [lB, lA]));
  });
});

describe("cross-family deletes and bulk statements without WHERE", () => {
  it("A deleting all attempts only deletes A's", async () => {
    await as("authenticated", A, `delete from public.attempts`);
    expect(await count("attempts", "parent_id = $1", [B])).toBe(1);
    expect(await count("attempts", "parent_id = $1", [A])).toBe(0);
  });
  it("bulk UPDATE without WHERE on every client-writable table touches only own rows", async () => {
    await as("authenticated", A, `update public.learners set nickname = 'pwned'`);
    await as("authenticated", A, `update public.lesson_sessions set ended_at = now()`);
    expect(await count("learners", "nickname = 'pwned' and parent_id = $1", [B])).toBe(0);
    expect(await count("lesson_sessions", "ended_at is not null and parent_id = $1", [B])).toBe(0);
    await refused(as("authenticated", A, `update public.attempts set correct = true`), /permission denied/);
    await refused(as("authenticated", A, `update public.brain_usage set turns = 0`), /permission denied/);
    await refused(as("authenticated", A, `delete from public.brain_usage`), /permission denied/);
    await refused(as("authenticated", A, `truncate public.attempts`), /permission denied/);
  });
  it("bulk DELETE without WHERE on learners/sessions removes only own rows", async () => {
    const before = await count("learners", "parent_id = $1", [B]);
    await as("authenticated", A, `delete from public.lesson_sessions`);
    await as("authenticated", A, `delete from public.learners where id = $1`, [lA2]);
    expect(await count("learners", "parent_id = $1", [B])).toBe(before);
    expect(await count("lesson_sessions", "parent_id = $1", [B])).toBe(1);
  });
});

describe("anon and auth.uid()", () => {
  it("anon: auth.uid() is null and every table is permission-denied (select/insert/update/delete)", async () => {
    expect((await as<{ u: string | null }>("anon", null, `select auth.uid() u`))[0].u).toBeNull();
    for (const t of ["learners", "lesson_sessions", "attempts", "brain_usage"]) {
      await refused(as("anon", null, `select count(*) from public.${t}`), /permission denied/);
      await refused(as("anon", null, `delete from public.${t}`), /permission denied/);
      await refused(as("anon", null, `update public.${t} set parent_id = parent_id`), /permission denied/);
    }
  });
  it("anon carrying a forged sub claim still gets nothing (no grants)", async () => {
    await refused(as("anon", A, `select * from public.learners`), /permission denied/);
  });
  it("private helper functions are not callable by API roles", async () => {
    await refused(as("authenticated", A, `select private.touch_updated_at()`), /permission denied/);
    await refused(as("anon", null, `select private.force_created_at()`), /permission denied/);
  });
});

describe("attempts identity sequence", () => {
  it("clients cannot supply their own id (GENERATED ALWAYS)", async () => {
    await refused(as("authenticated", A,
      `insert into public.attempts (id, learner_id, parent_id, skill, question_id, answer_id, correct, context) values (1, $1, $2, 's', 'q', 'a', true, 'taught')`, [lA, A]),
      /generated always|cannot insert/i);
  });
  // FINDING if this fails: with Supabase's default sequence grants, an authenticated
  // user can setval() the shared sequence to its maximum and every later insert by
  // every family fails (denial of service), or read currval/last_value to count all
  // families' attempts. Not reachable through the PostgREST Data API (setval is not
  // an exposed RPC), but reachable via any SQL path a role holds (e.g. future RPCs).
  it("authenticated cannot setval/read the shared attempts sequence", async () => {
    await refused(as("authenticated", A, `select setval(pg_get_serial_sequence('public.attempts','id'), 9223372036854775806)`), /permission denied/);
    await refused(as("authenticated", A, `select last_value from public.attempts_id_seq`), /permission denied/);
  });
});
