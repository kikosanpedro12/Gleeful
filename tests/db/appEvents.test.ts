/**
 * Product events table (20261123210909_app_events.sql) on real Postgres (PGlite). `npm run mutate` runs this file against
 * deliberately weakened copies of the migration; every weakening must turn it red.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { CODE_CAPS, EVENT_INSERT_SQL, eventInsertSql } from "@/lib/events/cap";
import { EVENT_CODES } from "@/lib/events/codes";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MIGRATIONS = process.env.MIGRATIONS_DIR || path.join(ROOT, "supabase/migrations");
const A = "00000000-0000-4000-8000-0000000000e1";
const B = "00000000-0000-4000-8000-0000000000e2";
let db: PGlite;
type Who = "anon" | "authenticated" | "service_role" | "billing_writer";

async function as<T = Record<string, unknown>>(role: Who, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
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
/** The app's own capped INSERT, run as the server role. */
const rec = (code: string, parent: string | null = null, tags: (string | null)[] = [null, null, null, null]) => as<{ id: string }>("billing_writer", EVENT_INSERT_SQL, [code, parent, ...tags]);
const count = async (where = "true") => Number((await db.query<{ n: number }>(`select count(*)::int as n from public.app_events where ${where}`)).rows[0].n);
const reset = () => db.exec(`truncate public.app_events restart identity`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "tests/db/supabase-stub.sql"), "utf8"));
  for (const f of fs.readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
}, 60_000);

describe("app_events: the browser roles get nothing", () => {
  for (const role of ["anon", "authenticated"] as const) {
    it(`${role} cannot read, write or delete`, async () => {
      await refused(as(role, `select * from public.app_events`), /permission denied/);
      await refused(as(role, `insert into public.app_events (code, parent_id) values ('signup', $1)`, [A]), /permission denied/);
      await refused(as(role, `delete from public.app_events`), /permission denied/);
    });
  }
  it("RLS is on", async () => {
    const r = await db.query<{ relrowsecurity: boolean }>(`select relrowsecurity from pg_class where relname = 'app_events' and relkind = 'r'`);
    expect(r.rows[0].relrowsecurity).toBe(true);
  });
  it("the server role can insert and read, but never update or delete", async () => {
    await reset();
    expect((await rec("signup", A)).length).toBe(1);
    expect((await as("billing_writer", `select id from public.app_events`)).length).toBe(1);
    await refused(as("billing_writer", `update public.app_events set code = 'signup'`), /permission denied/);
    await refused(as("billing_writer", `delete from public.app_events`), /permission denied/);
    await refused(as("billing_writer", `truncate public.app_events`), /permission denied/);
  });
  it("no SECURITY DEFINER function and no trigger on auth or app_events", async () => {
    const r = await db.query<{ n: number }>(`select count(*)::int as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.prosecdef`);
    expect(r.rows[0].n).toBe(0);
    const t = await db.query<{ n: number }>(`select count(*)::int as n from pg_trigger where tgrelid = 'public.app_events'::regclass and not tgisinternal`);
    expect(t.rows[0].n).toBe(0);
  });
});

describe("app_events: what a row may hold", () => {
  it("the code list matches the app's list", async () => {
    const def = (await db.query<{ d: string }>(`select pg_get_constraintdef(oid) as d from pg_constraint where conrelid = 'public.app_events'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%signup%' and pg_get_constraintdef(oid) not like '%parent_id%'`)).rows[0].d;
    for (const c of EVENT_CODES) expect(def, c).toContain(`'${c}'`);
    expect((def.match(/'[a-z_]+'/g) ?? []).length).toBe(EVENT_CODES.length);
  });
  it("an unknown code is refused (by the table itself, and the capped INSERT writes nothing for it)", async () => {
    await refused(as("billing_writer", `insert into public.app_events (code, parent_id) values ('page_view', $1)`, [A]), /check constraint/);
    await reset();
    expect((await rec("page_view", A)).length).toBe(0);
  });
  it("error codes never carry a parent id; other codes must", async () => {
    await refused(rec("brain_error", A), /check constraint/);
    await refused(rec("signup", null), /check constraint/);
    await refused(rec("active_day", null), /check constraint/);
  });
  it("campaign tags must be plain: lower case, [a-z0-9_.-], at most 40", async () => {
    await reset();
    for (const bad of ["Facebook", "a b", "mum@example.com", "x".repeat(41), "<script>", ""]) await refused(rec("signup", A, [bad, null, null, null]), /check constraint/);
    for (const col of [1, 2]) { const p = [null, null, null, null] as (string | null)[]; p[col] = "UPPER"; await refused(rec("signup", A, p), /check constraint/); }
    expect((await rec("signup", A, ["facebook", "cpc", "launch_1.v2", "news.example.com"])).length).toBe(1);
  });
  it("referrer must be a host name, not a URL, address or e-mail", async () => {
    await reset();
    for (const bad of ["https://x.com/a", "x.com/path", "a@b.com", "-x.com", "x.com-", "ab", "a b.com", "x".repeat(101) + ".com"]) await refused(rec("signup", A, [null, null, null, bad]), /check constraint/);
  });
  it("day is a Manila date set by the database", async () => {
    await reset();
    await db.exec(`insert into public.app_events (created_at, code, parent_id) values ('2026-11-23 17:30:00+00', 'signup', '${A}')`);
    expect((await db.query<{ d: string }>(`select day::text as d from public.app_events`)).rows[0].d).toBe("2026-11-24");
    await refused(as("billing_writer", `insert into public.app_events (code, parent_id, day) values ('signup', $1, '2020-01-01')`, [B]), /generated|cannot insert/i);
  });
});

describe("app_events: repeats do nothing", () => {
  it("signup and consent_given once per parent", async () => {
    await reset();
    for (const c of ["signup", "consent_given"]) { expect((await rec(c, A)).length).toBe(1); expect((await rec(c, A)).length).toBe(0); expect((await rec(c, B)).length).toBe(1); }
    expect(await count()).toBe(4);
  });
  it("active_day once per parent per day, a new day counts again", async () => {
    await reset();
    expect((await rec("active_day", A)).length).toBe(1);
    expect((await rec("active_day", A)).length).toBe(0);
    expect((await rec("active_day", B)).length).toBe(1);
    await db.exec(`insert into public.app_events (created_at, code, parent_id) values (now() - interval '2 days', 'active_day', '${A}')`);
    expect(await count(`code = 'active_day'`)).toBe(3);
  });
  it("learner_added and checkout_clicked can repeat (several children, several clicks)", async () => {
    await reset();
    for (let i = 0; i < 3; i++) { await rec("learner_added", A); await rec("checkout_clicked", A); }
    expect(await count(`code = 'learner_added'`)).toBe(3);
  });
});

describe("app_events: the unique indexes decide, even when the app's own repeat check is bypassed", () => {
  const raw = (code: string, parent: string) => as("billing_writer", `insert into public.app_events (code, parent_id) values ($1, $2)`, [code, parent]);
  for (const code of ["signup", "consent_given", "active_day", "checkout_clicked"]) {
    it(`a plain second ${code} for the same parent (same day) is refused by the table`, async () => {
      await reset();
      await raw(code, A);
      await refused(raw(code, A), /duplicate key|unique/i);
      await raw(code, B); // another parent is fine
    });
  }
  it("learner_added has no such rule (several children)", async () => { await reset(); await raw("learner_added", A); await raw("learner_added", A); });
  it("a different day is a different row for active_day and checkout_clicked", async () => {
    await reset();
    for (const code of ["active_day", "checkout_clicked"]) {
      await raw(code, A);
      await db.exec(`insert into public.app_events (created_at, code, parent_id) values (now() - interval '2 days', '${code}', '${A}')`);
    }
  });
});

describe("app_events: the write caps (anonymous-reachable codes cannot flood the table)", () => {
  it("the cap table is exactly the agreed one", () => {
    expect({ ...CODE_CAPS }).toEqual({ signup: 500, consent_given: 500, learner_added: 1000, active_day: 2000, checkout_clicked: 200, brain_error: 2000, brain_fallback: 2000, voice_error: 2000 });
  });
  const fill = (code: string, n: number, parented: boolean, age = "0 seconds") =>
    db.exec(`insert into public.app_events (created_at, code, parent_id) select now() - interval '${age}', '${code}', ${parented ? "md5(i::text)::uuid" : "null"} from generate_series(1, ${n}) i`);
  it("every code has its own hourly cap: at the cap that code is refused, the others still go through", async () => {
    for (const code of Object.keys(CODE_CAPS)) {
      await reset();
      const err = code.endsWith("_error") || code === "brain_fallback";
      await fill(code, CODE_CAPS[code as keyof typeof CODE_CAPS] - 1, !err);
      const parent = err ? null : B;
      expect((await rec(code, parent)).length, `${code} just under its cap`).toBe(1);
      expect((await rec(code, err ? null : A)).length, `${code} at its cap`).toBe(0);
      const other = code === "signup" ? "voice_error" : "signup";
      expect((await rec(other, other === "signup" ? A : null)).length, `${other} unaffected by ${code}`).toBe(1);
    }
  }, 60_000);
  it("old rows (over an hour) do not count against the hour", async () => {
    await reset();
    await fill("brain_error", CODE_CAPS.brain_error, false, "2 hours");
    expect((await rec("brain_error")).length).toBe(1);
  });
  it("checkout_clicked: one row per parent per day", async () => {
    await reset();
    expect((await rec("checkout_clicked", A)).length).toBe(1);
    expect((await rec("checkout_clicked", A)).length).toBe(0);
    expect((await rec("checkout_clicked", B)).length).toBe(1);
  });
  it("the lifetime cap counts rows (not ids): refused at the cap, allowed one below", async () => {
    const sql = eventInsertSql(50);
    const run = (code: string, parent: string | null) => as<{ id: string }>("billing_writer", sql, [code, parent, null, null, null, null]);
    await reset();
    await fill("learner_added", 49, true);
    expect((await run("brain_error", null)).length).toBe(1);
    expect((await run("brain_error", null)).length).toBe(0);
    expect((await run("signup", A)).length).toBe(0);
    expect(eventInsertSql()).toContain("< 1000000");
    expect(EVENT_INSERT_SQL).not.toContain("max(id)");
  });
});
