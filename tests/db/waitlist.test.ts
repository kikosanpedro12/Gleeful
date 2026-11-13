/**
 * Waitlist table: server-only. Browsers (anon, signed-in parents) can never
 * read or write it; the server (service_role) can only add a row.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MIGRATIONS = process.env.MIGRATIONS_DIR || path.join(ROOT, "supabase/migrations");
const A = "00000000-0000-4000-8000-00000000000a";
let db: PGlite;

type Who = "anon" | "authenticated" | "service_role";
async function as<T = Record<string, unknown>>(role: Who, uid: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
    await tx.query(`set local role ${role}`);
    return (await tx.query<T>(sql, params)).rows;
  });
}
const fails = async (p: Promise<unknown>) => {
  let err: unknown = null;
  try { await p; } catch (e) { err = e; }
  expect(err, "expected the database to refuse").not.toBeNull();
};
const add = (role: Who, email: string, consent = true, uid: string | null = null) =>
  as(role, uid, `insert into public.waitlist (email, consent, source) values ($1, $2, 'landing') on conflict (email) do nothing`, [email, consent]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "tests/db/supabase-stub.sql"), "utf8"));
  for (const f of fs.readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort())
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
  await db.query(`insert into auth.users (id, email) values ($1, 'a@example.test')`, [A]);
}, 60_000);

describe("waitlist: server-only", () => {
  it("the server (service_role) can add a parent, and a repeat is a silent no-op", async () => {
    await add("service_role", "parent@example.com");
    await add("service_role", "parent@example.com");
    const rows = await db.query<{ n: number }>(`select count(*)::int as n from public.waitlist where email = 'parent@example.com'`);
    expect(rows.rows[0].n).toBe(1);
  });
  it("signed-out visitors cannot add, read, edit or delete", async () => {
    await fails(add("anon", "anon@example.com"));
    await fails(as("anon", null, `select * from public.waitlist`));
    await fails(as("anon", null, `update public.waitlist set consent = true`));
    await fails(as("anon", null, `delete from public.waitlist`));
  });
  it("signed-in parents cannot add, read, edit or delete either", async () => {
    await fails(add("authenticated", "kid@example.com", true, A));
    await fails(as("authenticated", A, `select email from public.waitlist`));
    await fails(as("authenticated", A, `update public.waitlist set email = 'x@example.com'`));
    await fails(as("authenticated", A, `delete from public.waitlist`));
  });
  it("the server cannot edit or delete rows through the API", async () => {
    await fails(as("service_role", null, `update public.waitlist set consent = true`));
    await fails(as("service_role", null, `delete from public.waitlist`));
  });
  it("no consent, bad or mixed-case emails are refused", async () => {
    await fails(add("service_role", "noconsent@example.com", false));
    await fails(add("service_role", "Parent@Example.com"));
    await fails(add("service_role", "not-an-email"));
    await fails(add("service_role", `${"a".repeat(250)}@example.com`));
  });
  it("the database sets the time, not the caller", async () => {
    await db.query(`insert into public.waitlist (email, consent, created_at) values ('old@example.com', true, '2001-01-01')`);
    const r = await db.query<{ y: number }>(`select extract(year from created_at)::int as y from public.waitlist where email = 'old@example.com'`);
    expect(r.rows[0].y).toBeGreaterThan(2001);
  });
  it("RLS is on with no policies", async () => {
    const r = await db.query<{ rls: boolean; n: number }>(
      `select c.relrowsecurity as rls, (select count(*)::int from pg_policies p where p.tablename = 'waitlist') as n from pg_class c where c.relname = 'waitlist'`);
    expect(r.rows[0]).toEqual({ rls: true, n: 0 });
  });
});
