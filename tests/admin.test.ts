import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { allowlistSize, isAdminClaims, parseAllowlist } from "@/lib/admin/allowlist";
import { readEvents, recordEvent, resetEventsForTest } from "@/lib/admin/events";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const claims = (o: Record<string, unknown> = {}) => ({ sub: ID, email: "kiko@example.com", role: "authenticated", ...o });

describe("allowlist parsing", () => {
  it("empty, unset and junk mean nobody", () => {
    for (const raw of [undefined, null, "", "   ", ",,,", " , ", 5 as never, {} as never]) expect(allowlistSize(parseAllowlist(raw as never))).toBe(0);
  });
  it("trims, lower-cases, splits on commas, accepts emails and uuids", () => {
    const l = parseAllowlist("  Kiko@Example.COM ,\t" + ID.toUpperCase() + " ,, other@example.org");
    expect([...l.emails].sort()).toEqual(["kiko@example.com", "other@example.org"]);
    expect([...l.ids]).toEqual([ID]);
  });
  it("drops hostile or widening entries instead of honouring them", () => {
    const hostile = ["*", "*@example.com", "@example.com", "example.com", "a@b", "a b@example.com", '"kiko"@example.com', "kiko@example.com;x@y.com", "kiko@@example.com", "<script>@x.com", "kiko@example.com\nx@y.com", "a@b.c d", "%", "null", "true", "İ@example.com", "kıko@example.com", "x".repeat(300) + "@example.com", "123e4567", "{{x}}"];
    for (const h of hostile) expect(allowlistSize(parseAllowlist(h)), h).toBe(0);
  });
  it("caps the number of entries and the raw length", () => {
    const many = Array.from({ length: 40 }, (_, i) => `u${i}@example.com`).join(",");
    expect(allowlistSize(parseAllowlist(many))).toBe(20);
    expect(allowlistSize(parseAllowlist("a@example.com," + "x".repeat(5000)))).toBe(0);
  });
});

describe("isAdminClaims (fails closed)", () => {
  const list = parseAllowlist(`Kiko@Example.com`);
  it("matches the email in any case, with whitespace", () => {
    expect(isAdminClaims(claims(), list)).toBe(true);
    expect(isAdminClaims(claims({ email: "  KIKO@example.COM " }), list)).toBe(true);
  });
  it("matches by user id", () => expect(isAdminClaims(claims({ email: "x@y.com" }), parseAllowlist(ID))).toBe(true));
  it("an empty list admits nobody, even a perfect-looking user", () => {
    expect(isAdminClaims(claims(), parseAllowlist(""))).toBe(false);
    expect(isAdminClaims(claims(), parseAllowlist(undefined))).toBe(false);
  });
  it("rejects other users, substrings, lookalikes and domain tricks", () => {
    for (const email of ["kiko@example.com.evil.io", "xkiko@example.com", "kiko@example.co", "kiko+1@example.com", "kiko@example.com,other@x.com", "kıko@example.com", ""]) expect(isAdminClaims(claims({ email, sub: "00000000-0000-4000-8000-000000000000" }), list), email).toBe(false);
  });
  it("rejects anonymous sessions, wrong roles, and non-object or malformed claims", () => {
    expect(isAdminClaims(claims({ is_anonymous: true }), list)).toBe(false);
    expect(isAdminClaims(claims({ role: "anon" }), list)).toBe(false);
    expect(isAdminClaims(claims({ role: "service_role" }), list)).toBe(false);
    for (const c of [null, undefined, "kiko@example.com", 5, [], {}, claims({ email: ["kiko@example.com"] }), claims({ email: { toString: () => "kiko@example.com" } }), claims({ email: undefined, sub: 5 })]) expect(isAdminClaims(c, list)).toBe(false);
  });
  it("a hostile id in claims cannot hit a Map/Set prototype entry", () => {
    for (const sub of ["__proto__", "constructor", "toString"]) expect(isAdminClaims({ sub, role: "authenticated" }, list)).toBe(false);
  });
});

describe("requireAdmin: one 404 for every refusal", () => {
  const state: { claims: unknown; error: unknown; supabase: boolean; throws: boolean } = { claims: null, error: null, supabase: true, throws: false };
  beforeEach(() => { vi.resetModules(); Object.assign(state, { claims: null, error: null, supabase: true, throws: false }); delete process.env.ADMIN_EMAILS; });
  async function run(): Promise<"ok" | "404"> {
    vi.doMock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
    vi.doMock("@/lib/supabase/server", () => ({
      createServerSupabase: async () => state.supabase ? { auth: { getClaims: async () => { if (state.throws) throw new Error("boom"); return { data: state.claims ? { claims: state.claims } : null, error: state.error }; } } } : null,
    }));
    const { requireAdmin } = await import("@/lib/admin/guard");
    try { await requireAdmin(); return "ok"; } catch (e) { if ((e as Error).message === "NEXT_NOT_FOUND") return "404"; throw e; }
  }
  it("admin passes", async () => { process.env.ADMIN_EMAILS = "kiko@example.com"; state.claims = claims(); expect(await run()).toBe("ok"); });
  it("empty allowlist: 404 even for a signed-in user", async () => { state.claims = claims(); expect(await run()).toBe("404"); });
  it("signed out, non-admin, accounts off, auth error, auth throw: all 404", async () => {
    process.env.ADMIN_EMAILS = "kiko@example.com";
    state.claims = null; expect(await run()).toBe("404");
    state.claims = claims({ email: "someone@else.com", sub: "00000000-0000-4000-8000-000000000000" }); expect(await run()).toBe("404");
    state.claims = claims(); state.supabase = false; expect(await run()).toBe("404");
    state.supabase = true; state.error = new Error("bad jwt"); expect(await run()).toBe("404");
    state.error = null; state.throws = true; expect(await run()).toBe("404");
  });
});

describe("event counters are content-free", () => {
  beforeEach(resetEventsForTest);
  it("counts fixed codes per source and day", () => {
    recordEvent("taste", "upstream_error"); recordEvent("taste", "upstream_error"); recordEvent("brain", "moderated");
    expect(readEvents().counts).toEqual([{ key: "brain.moderated", count: 1 }, { key: "taste.upstream_error", count: 2 }]);
  });
  it("refuses anything that is not a plain event code (no text can be smuggled in)", () => {
    for (const e of ["What is your name? Maria", "a b", "UPPER", "x@y.com", "", "a".repeat(41), "__proto__.x", "1abc"]) recordEvent("brain", e);
    recordEvent("evil" as never, "ok");
    expect(readEvents().counts).toEqual([]);
  });
  it("bounds the table and resets on a new UTC day", () => {
    for (let i = 0; i < 200; i++) recordEvent("brain", "e" + "abcdefghij"[i % 10] + "_" + "klmnopqrst"[Math.floor(i / 10) % 10] + "_" + "uvwxyzabcd"[Math.floor(i / 100)]);
    expect(readEvents().counts.length).toBeLessThanOrEqual(64);
    const t = Date.UTC(2030, 0, 2);
    recordEvent("brain", "moderated", t);
    expect(readEvents(t).counts).toEqual([{ key: "brain.moderated", count: 1 }]);
  });
  it("the handlers record via the shared log and the page carries no free text", () => {
    for (const f of ["src/lib/brain/server/handler.ts", "src/lib/taste/server/handler.ts"]) expect(readFileSync(f, "utf8")).toContain("recordEvent(");
  });
});

describe("snapshot shows booleans and fixed labels only", () => {
  it("never contains a key, code or allowlist value", async () => {
    const SECRETS = ["sk-" + "ant-SECRETVALUE1234567890abcd", "xi-SECRETVALUE1234567890", "tester-code-SECRET-0123456789", "kiko@example.com", "cookie-secret-VALUE-0123456789"];
    const { buildSnapshot } = await import("@/lib/admin/snapshot");
    const env = { ANTHROPIC_API_KEY: SECRETS[0], ELEVENLABS_API_KEY: SECRETS[1], BRAIN_TESTER_CODE: SECRETS[2], ADMIN_EMAILS: SECRETS[3], TASTE_COOKIE_SECRET: SECRETS[4], NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc" };
    const out = JSON.stringify(buildSnapshot(env));
    for (const s of SECRETS) expect(out).not.toContain(s);
    expect(out).not.toContain("sb_publishable_abc");
    const s = buildSnapshot(env);
    expect(s.keys.every((k) => k.configured === true)).toBe(true);
    expect(buildSnapshot({}).keys.every((k) => k.configured === false)).toBe(true);
  });
  it("reports the switches from env, with the landing voice cap at 5,000", async () => {
    const { buildSnapshot } = await import("@/lib/admin/snapshot");
    const on = buildSnapshot({ SITE_INDEXING: "on", NEXT_PUBLIC_CHAR_GLB: "0", ELEVEN_LANDING: "off", BRAIN_DISABLED: "1" });
    const st = (n: string) => on.switches.find((x) => x.name === n)!.state;
    expect(st("SITE_INDEXING")).toMatch(/^ON/); expect(st("NEXT_PUBLIC_CHAR_GLB")).toMatch(/^OFF/); expect(st("ELEVEN_LANDING")).toBe("OFF"); expect(st("BRAIN_DISABLED")).toMatch(/^STOPPED/);
    expect(on.voiceLanding?.cap).toBe(5000);
  });
});

describe("admin is private and server-only", () => {
  it("page and layout are noindex server components, and ADMIN_EMAILS is never NEXT_PUBLIC_", () => {
    expect(readFileSync("src/app/admin/layout.tsx", "utf8")).toContain("index: false");
    for (const f of ["src/app/admin/page.tsx", "src/lib/admin/guard.ts", "src/lib/admin/snapshot.ts"]) { const t = readFileSync(f, "utf8"); expect(t).not.toMatch(/["']use client["']/); }
    for (const f of ["src/lib/admin/guard.ts", "src/lib/admin/snapshot.ts"]) expect(readFileSync(f, "utf8")).toContain('import "server-only"');
    expect(readFileSync(".env.example", "utf8")).not.toMatch(/NEXT_PUBLIC_ADMIN/);
    expect(readFileSync("src/app/admin/page.tsx", "utf8")).toContain("requireAdmin()");
  });
});
