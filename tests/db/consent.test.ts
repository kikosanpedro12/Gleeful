/**
 * Parental-consent table: the real migrations on real Postgres (PGlite) with Supabase-like roles.
 * Run by `npm run mutate` too: every weakening of 20261113083000_parental_consent.sql must turn this red.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MIGRATIONS = process.env.MIGRATIONS_DIR || path.join(ROOT, "supabase/migrations");
const A = "00000000-0000-4000-8000-0000000000c1";
const B = "00000000-0000-4000-8000-0000000000c2";
const V = "2026-11-13.v1";
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
// No RETURNING: it would apply the SELECT policy to the new row and could hide a broken INSERT policy.
const GIVE_QUIET = `insert into public.parental_consents (parent_id, consent_text_version) values ($1, $2)`;
const GIVE = `insert into public.parental_consents (parent_id, consent_text_version) values ($1, $2) returning id, accepted_at, withdrawn_at`;

let idA = "";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "tests/db/supabase-stub.sql"), "utf8"));
  for (const f of fs.readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
  await db.query(`insert into auth.users (id, email) values ($1, 'a@c.test'), ($2, 'b@c.test')`, [A, B]);
  idA = (await as<{ id: string }>("authenticated", A, GIVE, [A, V]))[0].id;
}, 60_000);

describe("consent: only the parent sees and gives their own", () => {
  it("A sees A's agreement; B sees nothing of it, even by id", async () => {
    expect((await as("authenticated", A, `select * from public.parental_consents`)).length).toBe(1);
    expect(await as("authenticated", B, `select * from public.parental_consents`)).toEqual([]);
    expect(await as("authenticated", B, `select * from public.parental_consents where id = $1`, [idA])).toEqual([]);
  });
  it("anonymous visitors get no access at all", async () => {
    await refused(as("anon", null, `select * from public.parental_consents`), /permission denied/);
    await refused(as("anon", null, GIVE, [A, V]), /permission denied/);
  });
  it("B cannot record consent on A's behalf", async () => {
    await refused(as("authenticated", B, GIVE_QUIET, [A, "other.v9"]), /row-level security/);
    expect(((await db.query(`select count(*)::int as n from public.parental_consents where consent_text_version = 'other.v9'`)).rows[0] as { n: number }).n).toBe(0);
  });
  it("signed in with no user id (malformed token) sees nothing and can add nothing", async () => {
    expect(await as("authenticated", null, `select * from public.parental_consents`)).toEqual([]);
    await refused(as("authenticated", null, GIVE_QUIET, [A, "x.v1"]), /row-level security/);
  });
});

describe("consent: the database, not the client, decides the times", () => {
  it("a back-dated accepted_at or a pre-set withdrawn_at is ignored on insert", async () => {
    const r = await as<{ accepted_at: string; withdrawn_at: string | null }>("authenticated", B,
      `insert into public.parental_consents (parent_id, consent_text_version, accepted_at, withdrawn_at) values ($1, 'ts.v1', '2001-01-01', '2001-01-02') returning accepted_at, withdrawn_at`, [B]);
    expect(new Date(r[0].accepted_at).getFullYear()).toBeGreaterThanOrEqual(2024);
    expect(r[0].withdrawn_at).toBeNull();
  });
  it("only one active agreement per parent per version", async () => {
    await refused(as("authenticated", A, GIVE, [A, V]), /duplicate key|unique/);
  });
  it("even with the triggers out of the way, a withdrawal can never precede the agreement (table check)", async () => {
    await db.exec(`set session_replication_role = replica`);
    try {
      await refused(db.query(`insert into public.parental_consents (parent_id, consent_text_version, accepted_at, withdrawn_at) values ($1, 'order.v1', '2026-01-02', '2026-01-01')`, [B]), /check|violates/);
    } finally { await db.exec(`set session_replication_role = origin`); }
  });
  it("the version id must look like a version id", async () => {
    for (const bad of ["", "a b", "x".repeat(33), "v1;drop", "ünï"]) await refused(as("authenticated", B, GIVE, [B, bad]), /check|violates/);
  });
});

describe("consent: withdraw only, and only once", () => {
  it("a parent can withdraw; the database stamps the time (a back-dated value is ignored)", async () => {
    const r = await as<{ withdrawn_at: string }>("authenticated", A, `update public.parental_consents set withdrawn_at = '2001-01-01' where id = $1 returning withdrawn_at`, [idA]);
    expect(new Date(r[0].withdrawn_at).getFullYear()).toBeGreaterThanOrEqual(2024);
  });
  it("withdrawn stays withdrawn: no un-withdrawing, no re-dating", async () => {
    const before = (await as<{ withdrawn_at: string }>("authenticated", A, `select withdrawn_at from public.parental_consents where id = $1`, [idA]))[0].withdrawn_at;
    await as("authenticated", A, `update public.parental_consents set withdrawn_at = null where id = $1`, [idA]);
    await as("authenticated", A, `update public.parental_consents set withdrawn_at = now() + interval '1 day' where id = $1`, [idA]);
    const after = (await as<{ withdrawn_at: string }>("authenticated", A, `select withdrawn_at from public.parental_consents where id = $1`, [idA]))[0].withdrawn_at;
    expect(after).toEqual(before);
  });
  it("after withdrawing, the parent can agree again (a new row)", async () => {
    const r = await as("authenticated", A, GIVE, [A, V]);
    expect(r.length).toBe(1);
  });
  it("nothing but withdrawn_at is editable: not the version, the time agreed, the owner or the id", async () => {
    const id = (await as<{ id: string }>("authenticated", B, GIVE, [B, "edit.v1"]))[0].id;
    for (const col of ["consent_text_version = 'forged.v1'", "accepted_at = '2001-01-01'", `parent_id = '${A}'`, `id = gen_random_uuid()`])
      await refused(as("authenticated", B, `update public.parental_consents set ${col} where id = $1`, [id]), /permission denied/);
  });
  it("B cannot withdraw A's agreement (silently affects nothing)", async () => {
    const id = (await as<{ id: string }>("authenticated", A, GIVE, [A, "other-b.v1"]))[0].id;
    expect(await as("authenticated", B, `update public.parental_consents set withdrawn_at = now() where id = $1 returning id`, [id])).toEqual([]);
    const row = await as<{ withdrawn_at: string | null }>("authenticated", A, `select withdrawn_at from public.parental_consents where id = $1`, [id]);
    expect(row[0].withdrawn_at).toBeNull();
  });
  it("nobody but the server can delete the record, parent included", async () => {
    await refused(as("authenticated", A, `delete from public.parental_consents where id = $1`, [idA]), /permission denied/);
    await refused(as("authenticated", B, `delete from public.parental_consents`), /permission denied/);
    await refused(as("anon", null, `delete from public.parental_consents`), /permission denied/);
  });
  it("deleting the parent's account deletes their consent rows", async () => {
    const C = "00000000-0000-4000-8000-0000000000c3";
    await db.query(`insert into auth.users (id, email) values ($1, 'c@c.test')`, [C]);
    await as("authenticated", C, GIVE, [C, "gone.v1"]);
    await db.query(`delete from auth.users where id = $1`, [C]);
    expect(((await db.query(`select count(*)::int as n from public.parental_consents where parent_id = $1`, [C])).rows[0] as { n: number }).n).toBe(0);
  });
});
