/**
 * Billing tables: the real migrations on real Postgres (PGlite). `npm run mutate` also runs this file against
 * deliberately weakened copies of 20261123120000_billing.sql; every weakening must turn it red.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MIGRATIONS = process.env.MIGRATIONS_DIR || path.join(ROOT, "supabase/migrations");
const A = "00000000-0000-4000-8000-0000000000d1";
let db: PGlite;
type Who = "anon" | "authenticated" | "service_role" | "billing_writer";

async function as<T = Record<string, unknown>>(role: Who, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [A]);
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
const SUB = `insert into public.subscriptions (email_norm, plan, status, period_end) values ($1, $2, $3, now() + interval '7 days')`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "tests/db/supabase-stub.sql"), "utf8"));
  for (const f of fs.readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
  await db.query(`insert into auth.users (id, email) values ($1, 'a@c.test')`, [A]);
}, 60_000);

const TABLES = ["subscriptions", "billing_events", "billing_usage"];

describe("billing: the browser roles get nothing", () => {
  for (const role of ["anon", "authenticated"] as const) {
    for (const t of TABLES) {
      it(`${role} cannot read ${t}`, async () => { await refused(as(role, `select * from public.${t}`), /permission denied/); });
    }
    it(`${role} cannot grant themselves a plan`, async () => { await refused(as(role, SUB, ["a@c.test", "family", "active"]), /permission denied/); });
    it(`${role} cannot reset their usage`, async () => {
      await refused(as(role, `update public.billing_usage set turns = 0`), /permission denied/);
      await refused(as(role, `delete from public.billing_usage`), /permission denied/);
    });
  }
  it("RLS is on for every billing table", async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(`select relname, relrowsecurity from pg_class where relname = any($1::text[]) and relkind = 'r'`, [TABLES]);
    expect(r.rows.length).toBe(3);
    for (const row of r.rows) expect(row.relrowsecurity, row.relname).toBe(true);
  });
  it("no SECURITY DEFINER function exists in public", async () => {
    const r = await db.query<{ n: number }>(`select count(*)::int as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.prosecdef`);
    expect(r.rows[0].n).toBe(0);
  });
});

describe("billing: billing_writer can do exactly its job", () => {
  it("adds and reads a subscription, changes its status, never deletes it", async () => {
    await as("billing_writer", SUB, ["fam@c.test", "family", "trialing"]);
    expect((await as("billing_writer", `select * from public.subscriptions where email_norm = 'fam@c.test'`)).length).toBe(1);
    await as("billing_writer", `update public.subscriptions set status = 'active', plan = 'solo', last_event_at = now() where email_norm = 'fam@c.test'`);
    expect((await as<{ status: string }>("billing_writer", `select status from public.subscriptions where email_norm = 'fam@c.test'`))[0].status).toBe("active");
    await refused(as("billing_writer", `delete from public.subscriptions`), /permission denied/);
  });
  it("cannot re-key a subscription to another e-mail", async () => {
    await refused(as("billing_writer", `update public.subscriptions set email_norm = 'other@c.test' where email_norm = 'fam@c.test'`), /permission denied/);
  });
  it("records a webhook event once; a replay of the same id is refused by the key", async () => {
    await as("billing_writer", `insert into public.billing_events (event_id, type, email_norm) values ('evt_1', 'subscription.created', 'fam@c.test')`);
    await refused(as("billing_writer", `insert into public.billing_events (event_id, type, email_norm) values ('evt_1', 'subscription.created', 'fam@c.test')`), /duplicate key/);
    await refused(as("billing_writer", `update public.billing_events set type = 'x'`), /permission denied/);
    await refused(as("billing_writer", `delete from public.billing_events`), /permission denied/);
  });
  it("counts usage up, never down by hand or past a negative", async () => {
    const q = `insert into public.billing_usage (email_norm, period_end, turns) values ('fam@c.test', '2026-12-01T00:00:00Z', 1) on conflict (email_norm, period_end) do update set turns = public.billing_usage.turns + 1`;
    await as("billing_writer", q);
    await as("billing_writer", q);
    expect((await as<{ turns: number }>("billing_writer", `select turns from public.billing_usage where email_norm = 'fam@c.test'`))[0].turns).toBe(2);
    await refused(as("billing_writer", `update public.billing_usage set turns = -5`), /check constraint/);
    await refused(as("billing_writer", `update public.billing_usage set period_end = now()`), /permission denied/);
    await refused(as("billing_writer", `delete from public.billing_usage`), /permission denied/);
  });
  it("sees nothing else in the database", async () => {
    for (const t of ["public.learners", "public.parental_consents", "public.lesson_sessions", "public.attempts", "public.brain_usage", "auth.users"]) {
      await refused(as("billing_writer", `select * from ${t}`), /permission denied/);
    }
  });
});

describe("billing: bad data never lands", () => {
  it("rejects unknown plans and statuses, upper-case or malformed e-mails", async () => {
    await refused(as("billing_writer", SUB, ["x1@c.test", "platinum", "active"]), /check constraint/);
    await refused(as("billing_writer", SUB, ["x2@c.test", "solo", "free_forever"]), /check constraint/);
    await refused(as("billing_writer", SUB, ["X3@C.TEST", "solo", "active"]), /check constraint/);
    await refused(as("billing_writer", SUB, ["not-an-email", "solo", "active"]), /check constraint/);
    await refused(as("billing_writer", SUB, [`${"a".repeat(260)}@c.test`, "solo", "active"]), /check constraint/);
  });
  it("rejects an oversized event id", async () => {
    await refused(as("billing_writer", `insert into public.billing_events (event_id, type, email_norm) values ($1, 't', 'a@c.test')`, ["e".repeat(81)]), /check constraint/);
  });
});
