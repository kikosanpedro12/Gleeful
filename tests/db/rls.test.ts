/**
 * Database security tests: the real migration, real Postgres (PGlite), real RLS.
 * Two parents (A, B) and an anonymous visitor try to read, write and tamper
 * with each other's children's data.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MIGRATIONS = process.env.MIGRATIONS_DIR || path.join(ROOT, "supabase/migrations");
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
let db: PGlite;

type Who = "anon" | "authenticated" | "service_role";
/** Run SQL as an API role, optionally as a signed-in user, inside a rolled-back-on-error transaction. */
async function as<T = Record<string, unknown>>(role: Who, uid: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
    await tx.query(`set local role ${role}`);
    const r = await tx.query<T>(sql, params);
    return r.rows;
  });
}
const fails = async (p: Promise<unknown>, re?: RegExp) => {
  let err: unknown = null;
  try { await p; } catch (e) { err = e; }
  expect(err, "expected the database to refuse").not.toBeNull();
  if (re) expect(String((err as Error).message)).toMatch(re);
};

let learnerA = "", learnerB = "", sessionA = "", sessionA2 = "", learnerA2 = "";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "tests/db/supabase-stub.sql"), "utf8"));
  for (const f of fs.readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort())
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
  await db.query(`insert into auth.users (id, email) values ($1, 'a@example.test'), ($2, 'b@example.test')`, [A, B]);
  learnerA = (await as<{ id: string }>("authenticated", A, `insert into public.learners (parent_id, nickname, grade) values ($1, 'Kid A', 3) returning id`, [A]))[0].id;
  learnerA2 = (await as<{ id: string }>("authenticated", A, `insert into public.learners (parent_id, nickname, grade) values ($1, 'Kid A2', 5) returning id`, [A]))[0].id;
  learnerB = (await as<{ id: string }>("authenticated", B, `insert into public.learners (parent_id, nickname, grade) values ($1, 'Kid B', 4) returning id`, [B]))[0].id;
  sessionA = (await as<{ id: string }>("authenticated", A, `insert into public.lesson_sessions (learner_id, parent_id, teacher, brain) values ($1, $2, 'leo', 'scripted') returning id`, [learnerA, A]))[0].id;
  sessionA2 = (await as<{ id: string }>("authenticated", A, `insert into public.lesson_sessions (learner_id, parent_id, teacher, brain) values ($1, $2, 'mia', 'scripted') returning id`, [learnerA2, A]))[0].id;
  await as("authenticated", A, `insert into public.attempts (learner_id, parent_id, session_id, skill, question_id, answer_id, correct, hints_used, context) values ($1, $2, $3, 'science.mars.red_color', 'q_red', 'rust', true, 1, 'taught')`, [learnerA, A, sessionA]);
}, 60_000);

describe("RLS: parents only ever see their own children", () => {
  it("parent A sees only A's learners; parent B only B's", async () => {
    const a = await as<{ nickname: string }>("authenticated", A, `select nickname from public.learners order by nickname`);
    const b = await as<{ nickname: string }>("authenticated", B, `select nickname from public.learners`);
    expect(a.map((r) => r.nickname)).toEqual(["Kid A", "Kid A2"]);
    expect(b.map((r) => r.nickname)).toEqual(["Kid B"]);
  });
  it("B cannot read A's sessions or attempts, even by id", async () => {
    expect(await as("authenticated", B, `select * from public.lesson_sessions where id = $1`, [sessionA])).toEqual([]);
    expect(await as("authenticated", B, `select * from public.attempts where learner_id = $1`, [learnerA])).toEqual([]);
  });
  it("anonymous visitors get no access at all (not even an empty result)", async () => {
    for (const t of ["learners", "lesson_sessions", "attempts", "brain_usage"])
      await fails(as("anon", null, `select * from public.${t}`), /permission denied/);
    await fails(as("anon", null, `insert into public.learners (parent_id, nickname, grade) values ($1, 'x', 3)`, [A]), /permission denied/);
  });
  it("signed in but no user id (malformed token) sees nothing", async () => {
    expect(await as("authenticated", null, `select * from public.learners`)).toEqual([]);
  });
});

describe("RLS: no writing into someone else's family", () => {
  it("B cannot create a learner under A", async () => {
    await fails(as("authenticated", B, `insert into public.learners (parent_id, nickname, grade) values ($1, 'evil', 3)`, [A]), /row-level security/);
  });
  it("B cannot move its own learner to A (update WITH CHECK)", async () => {
    // Two layers refuse this: parent_id is not an updatable column (grant), and the
    // update policy's WITH CHECK. Without WHERE/RETURNING Postgres skips the SELECT
    // policy on the new row, so this WHERE-less form is the one that tests the layers.
    await fails(as("authenticated", B, `update public.learners set parent_id = $1 where id = $2`, [A, learnerB]), /row-level security|permission denied/);
    await fails(as("authenticated", B, `update public.learners set parent_id = $1`, [A]), /row-level security|permission denied/);
    const sb = await as<{ id: string }>("authenticated", B, `insert into public.lesson_sessions (learner_id, parent_id, teacher, brain) values ($1, $2, 'leo', 'scripted') returning id`, [learnerB, B]);
    await fails(as("authenticated", B, `update public.lesson_sessions set parent_id = $1`, [A]));
    await as("authenticated", B, `delete from public.lesson_sessions where id = $1`, [sb[0].id]);
  });
  it("B's update/delete of A's learner silently affects nothing", async () => {
    expect(await as("authenticated", B, `update public.learners set nickname = 'hacked' where id = $1 returning id`, [learnerA])).toEqual([]);
    expect(await as("authenticated", B, `delete from public.learners where id = $1 returning id`, [learnerA])).toEqual([]);
    const still = await as<{ nickname: string }>("authenticated", A, `select nickname from public.learners where id = $1`, [learnerA]);
    expect(still[0].nickname).toBe("Kid A");
  });
  it("B cannot attach a session to A's learner, with either parent id", async () => {
    // parent_id = A → RLS refuses; parent_id = B → composite foreign key refuses (B is not that learner's parent).
    await fails(as("authenticated", B, `insert into public.lesson_sessions (learner_id, parent_id, teacher, brain) values ($1, $2, 'leo', 'scripted')`, [learnerA, A]), /row-level security/);
    await fails(as("authenticated", B, `insert into public.lesson_sessions (learner_id, parent_id, teacher, brain) values ($1, $2, 'leo', 'scripted')`, [learnerA, B]), /foreign key/);
  });
  it("B cannot write evidence for A's learner, or point evidence at A's session", async () => {
    const ins = `insert into public.attempts (learner_id, parent_id, session_id, skill, question_id, answer_id, correct, context) values ($1, $2, $3, 'm.s', 'q', 'a', true, 'taught')`;
    await fails(as("authenticated", B, ins, [learnerA, B, null]), /foreign key/);
    await fails(as("authenticated", B, ins, [learnerB, B, sessionA]), /foreign key/);
  });
  it("a parent cannot link one child's attempt to another child's session", async () => {
    const ins = `insert into public.attempts (learner_id, parent_id, session_id, skill, question_id, answer_id, correct, context) values ($1, $2, $3, 'm.s', 'q', 'a', true, 'taught')`;
    await fails(as("authenticated", A, ins, [learnerA, A, sessionA2]), /foreign key/);
  });
});

describe("column-scoped updates", () => {
  it("parents can rename a child and end a session", async () => {
    expect(await as("authenticated", B, `update public.learners set nickname = 'Kid B!', grade = 5 where id = $1 returning id`, [learnerB])).toHaveLength(1);
  });
  it("parents can never rewrite ids, ownership or timestamps", async () => {
    for (const col of ["id = gen_random_uuid()", "parent_id = parent_id", "created_at = now()", "updated_at = now()"])
      await fails(as("authenticated", B, `update public.learners set ${col} where id = $1`, [learnerB]), /permission denied/);
    for (const col of ["learner_id = learner_id", "parent_id = parent_id", "started_at = now()", "teacher = 'mia'", "brain = 'model'"])
      await fails(as("authenticated", A, `update public.lesson_sessions set ${col} where id = $1`, [sessionA]), /permission denied/);
  });
});

describe("evidence integrity", () => {
  it("attempts are append-only for clients (no update grant)", async () => {
    await fails(as("authenticated", A, `update public.attempts set correct = true`), /permission denied/);
  });
  it("the database sets created_at; a client cannot back-date evidence", async () => {
    const r = await as<{ created_at: string }>("authenticated", A,
      `insert into public.attempts (learner_id, parent_id, skill, question_id, answer_id, correct, context, created_at)
       values ($1, $2, 'm.s', 'q', 'a', true, 'later_check', '2001-01-01') returning created_at`, [learnerA, A]);
    expect(new Date(r[0].created_at).getFullYear()).toBeGreaterThan(2020);
  });
  it("the database sets started_at; a client cannot back-date a lesson session", async () => {
    const r = await as<{ started_at: string }>("authenticated", A,
      `insert into public.lesson_sessions (learner_id, parent_id, teacher, brain, started_at)
       values ($1, $2, 'leo', 'scripted', '2001-01-01') returning started_at`, [learnerA, A]);
    expect(new Date(r[0].started_at).getFullYear()).toBeGreaterThan(2020);
  });
  it("constraints reject junk: grade 13, empty nickname, unknown teacher/context, free-text ids", async () => {
    const L = `insert into public.learners (parent_id, nickname, grade, preferred_teacher) values ($1, $2, $3, $4)`;
    await fails(as("authenticated", A, L, [A, "x", 13, "leo"]), /check/);
    await fails(as("authenticated", A, L, [A, "x", -1, "leo"]), /check/);
    await fails(as("authenticated", A, L, [A, "   ", 3, "leo"]), /check/);
    await fails(as("authenticated", A, L, [A, "x", 3, "bob"]), /check/);
    const T = `insert into public.attempts (learner_id, parent_id, skill, question_id, answer_id, correct, context) values ($1, $2, 'm.s', $3, 'a', true, $4)`;
    await fails(as("authenticated", A, T, [learnerA, A, "q", "mastered"]), /check/);
    await fails(as("authenticated", A, T, [learnerA, A, "<script>", "taught"]), /check/);
  });
});

describe("kindergarten (grade 0)", () => {
  it("a parent can add and move a learner to grade 0, and nothing wider", async () => {
    const L = `insert into public.learners (parent_id, nickname, grade) values ($1, $2, $3) returning id, grade`;
    const k = await as<{ id: string; grade: number }>("authenticated", A, L, [A, "Little K", 0]);
    expect(k[0].grade).toBe(0);
    expect(await as("authenticated", A, `update public.learners set grade = 12 where id = $1 returning id`, [k[0].id])).toHaveLength(1);
    expect(await as("authenticated", A, `update public.learners set grade = 0 where id = $1 returning id`, [k[0].id])).toHaveLength(1);
    await fails(as("authenticated", A, `update public.learners set grade = 13 where id = $1`, [k[0].id]), /check/);
  });
});

describe("brain usage: server-only writes", () => {
  it("parents cannot write usage rows (no client grant)", async () => {
    await fails(as("authenticated", A, `insert into public.brain_usage (learner_id, parent_id, turns) values ($1, $2, 0)`, [learnerA, A]), /permission denied/);
  });
  it("the server (service role) writes; each parent reads only their own", async () => {
    await as("service_role", null, `insert into public.brain_usage (learner_id, parent_id, turns, input_tokens, output_tokens) values ($1, $2, 12, 3000, 400), ($3, $4, 5, 900, 100)`, [learnerA, A, learnerB, B]);
    const a = await as<{ turns: number }>("authenticated", A, `select turns from public.brain_usage`);
    expect(a.map((r) => r.turns)).toEqual([12]);
    await fails(as("authenticated", A, `update public.brain_usage set turns = 0`), /permission denied/);
  });
});

describe("deleting history", () => {
  it("deleting a learner removes their sessions, attempts and usage", async () => {
    await as("authenticated", A, `delete from public.learners where id = $1`, [learnerA2]);
    const left = await db.query(`select count(*)::int as n from public.lesson_sessions where learner_id = $1`, [learnerA2]);
    expect((left.rows[0] as { n: number }).n).toBe(0);
  });
  it("deleting a parent account removes everything of theirs, and nothing of anyone else's", async () => {
    await db.query(`delete from auth.users where id = $1`, [A]);
    const n = async (t: string, who: string) => ((await db.query(`select count(*)::int as n from public.${t} where parent_id = $1`, [who])).rows[0] as { n: number }).n;
    for (const t of ["learners", "lesson_sessions", "attempts", "brain_usage"]) expect(await n(t, A)).toBe(0);
    expect(await n("learners", B)).toBe(1);
    expect(await n("brain_usage", B)).toBe(1);
  });
});

describe("schema hygiene", () => {
  it("every table in the exposed schema has RLS enabled", async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'`);
    expect(r.rows.length).toBeGreaterThan(0);
    for (const row of r.rows) expect(row.relrowsecurity, row.relname).toBe(true);
  });
  it("no SECURITY DEFINER functions anywhere in our schemas", async () => {
    const r = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private') and p.prosecdef`);
    expect(r.rows).toEqual([]);
  });
  it("API roles hold no privilege on any sequence, and anon none on any table", async () => {
    const seq = await db.query<{ relname: string }>(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'S'`);
    expect(seq.rows.length).toBeGreaterThan(0);
    for (const { relname } of seq.rows) for (const role of ["anon", "authenticated"]) for (const priv of ["USAGE", "SELECT", "UPDATE"]) {
      const r = await db.query<{ ok: boolean }>(`select has_sequence_privilege($1, $2, $3) as ok`, [role, `public.${relname}`, priv]);
      expect(r.rows[0].ok, `${role} ${priv} on ${relname}`).toBe(false);
    }
    const tabs = await db.query<{ relname: string }>(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')`);
    for (const { relname } of tabs.rows) for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
      const r = await db.query<{ ok: boolean }>(`select has_table_privilege('anon', $1, $2) as ok`, [`public.${relname}`, priv]);
      expect(r.rows[0].ok, `anon ${priv} on ${relname}`).toBe(false);
    }
  });
  it("authenticated can never TRUNCATE (truncate bypasses RLS)", async () => {
    for (const t of ["learners", "lesson_sessions", "attempts", "brain_usage"])
      await fails(as("authenticated", A, `truncate public.${t}`), /permission denied/);
  });
  it("any view in public must be security_invoker (views bypass RLS otherwise)", async () => {
    const r = await db.query<{ relname: string; opts: string[] | null }>(`select c.relname, c.reloptions as opts from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'v'`);
    for (const v of r.rows) expect((v.opts ?? []).join(","), v.relname).toMatch(/security_invoker=(true|on)/);
  });
  it("the private schema is not usable by API roles", async () => {
    await fails(as("authenticated", B, `select private.touch_updated_at()`), /permission denied/);
  });
});
