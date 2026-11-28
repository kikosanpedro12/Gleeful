/** Tester-added attacks on app_events (20261123210909). Not part of the mutation set; run with `npm test`. */
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { EVENT_INSERT_SQL } from "@/lib/events/cap";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MIGRATIONS = process.env.MIGRATIONS_DIR || path.join(ROOT, "supabase/migrations");
const A = "00000000-0000-4000-8000-0000000000f1";
const B = "00000000-0000-4000-8000-0000000000f2";
let db: PGlite;
const rec = async (code: string, parent: string | null = null, tags: (string | null)[] = [null, null, null, null]) =>
  db.transaction(async (tx) => { await tx.query("set local role billing_writer"); return (await tx.query(EVENT_INSERT_SQL, [code, parent, ...tags])).rows; });
const reset = () => db.exec(`truncate public.app_events restart identity`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "tests/db/supabase-stub.sql"), "utf8"));
  for (const f of fs.readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
}, 60_000);

describe("app_events: privacy by shape", () => {
  it("the table has no column that could hold an e-mail, a name or free text", async () => {
    const cols = (await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_schema='public' and table_name='app_events'`)).rows.map((r) => r.column_name).sort();
    expect(cols).toEqual(["code", "created_at", "day", "id", "parent_id", "referrer_host", "utm_campaign", "utm_medium", "utm_source"]);
  });
  it("control characters, bidi marks and SQL-ish text are refused in every tag column (even from the server role)", async () => {
    for (const bad of ["a\nb", "a‮b", "x'; drop table app_events;--", "a b", "é"]) {
      for (let col = 0; col < 3; col++) { const t: (string | null)[] = [null, null, null, null]; t[col] = bad; await expect(rec("signup", A, t), JSON.stringify(bad)).rejects.toThrow(/check constraint/); }
    }
    await expect(rec("signup", A, [null, null, null, "exa‮mple.com"])).rejects.toThrow(/check constraint/);
  });
  it("tags on a non-signup code are accepted by the table but the app never sends them (validateEvent drops them)", async () => {
    await reset();
    expect((await rec("learner_added", A, ["x", null, null, null])).length).toBe(1); // table-level: allowed, documents the gap is app-side only
  });
});

describe("app_events: rapid repeats", () => {
  it("50 concurrent identical signups insert exactly one row", async () => {
    await reset();
    await Promise.all(Array.from({ length: 50 }, () => rec("signup", A).catch(() => [])));
    expect(Number((await db.query<{ n: number }>(`select count(*)::int as n from public.app_events`)).rows[0].n)).toBe(1);
  });
});

// Gaps the tester found, now fixed (per-code caps; a repeat takes no identity value).
describe("app_events: former gaps (fixed)", () => {
  it("checkout clicks (even at their cap) cannot starve sign-ups for the rest of the hour", async () => {
    await reset();
    await db.exec(`insert into public.app_events (code, parent_id) select 'checkout_clicked', md5(i::text)::uuid from generate_series(1, 2000) i`);
    expect((await rec("signup", B)).length).toBe(1);
    expect((await rec("checkout_clicked", B)).length).toBe(0);
  });
  it("repeats that hit ON CONFLICT should not consume ids toward the 1,000,000 lifetime cap", async () => {
    await reset();
    for (let i = 0; i < 20; i++) await rec("signup", A);
    expect(Number((await db.query<{ m: number }>(`select max(id)::int as m from public.app_events`)).rows[0].m)).toBe(1);
    const next = await rec("signup", B);
    expect(Number((next[0] as { id: string }).id)).toBe(2);
  });
});
