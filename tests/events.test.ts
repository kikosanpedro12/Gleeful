import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { ERROR_CODES, EVENT_CODES, eventForServerCounter, sanitizeHost, sanitizeTag, validateEvent } from "@/lib/events/codes";
import { CAMPAIGN_COOKIE, campaignFromRequest, cookieToSet, decodeCampaign, encodeCampaign } from "@/lib/events/campaign";
import { isFreshAccount } from "@/lib/events/signup";
import { CODE_CAPS, EVENT_INSERT_SQL } from "@/lib/events/cap";
import { recordActiveDay, recordEvent, resetActiveDayForTest, type RecordDeps } from "@/lib/events/record";
import { daysBefore, manilaDate, shapeHealth, shapeSources } from "@/lib/events/stats";
import { buildCsp, proxy } from "@/proxy";

const P = "123e4567-e89b-42d3-a456-426614174000";
const deps = (over: Partial<RecordDeps> = {}): RecordDeps & { calls: unknown[] } => {
  const calls: unknown[] = [];
  return { configured: () => true, run: async (e) => { calls.push(e); }, deadlineMs: 50, calls, ...over };
};

describe("event validation", () => {
  it("only fixed codes", () => {
    expect(EVENT_CODES.length).toBe(8);
    expect(validateEvent("page_view", { parentId: P })).toBeNull();
    expect(validateEvent("__proto__", { parentId: P })).toBeNull();
    expect(validateEvent(undefined)).toBeNull();
    expect(validateEvent("signup", { parentId: P })?.code).toBe("signup");
  });
  it("parent events need a real uuid; error events never keep one", () => {
    for (const bad of [undefined, null, "", "mum@example.com", "123", P + "x", "'; drop table app_events;--"]) expect(validateEvent("active_day", { parentId: bad as string }), String(bad)).toBeNull();
    expect(validateEvent("active_day", { parentId: P.toUpperCase() })?.parentId).toBe(P);
    for (const c of ERROR_CODES) expect(validateEvent(c, { parentId: P })?.parentId, c).toBeNull();
  });
  it("campaign tags are kept only on signup", () => {
    const ctx = { parentId: P, utmSource: "Facebook", utmMedium: "cpc", utmCampaign: "launch", referrerHost: "news.example.com" };
    expect(validateEvent("signup", ctx)).toMatchObject({ utmSource: "facebook", utmMedium: "cpc", utmCampaign: "launch", referrerHost: "news.example.com" });
    expect(validateEvent("active_day", ctx)).toMatchObject({ utmSource: null, utmMedium: null, utmCampaign: null, referrerHost: null });
  });
  it("tags: anything outside [a-z0-9_.-] is dropped, never rewritten", () => {
    for (const bad of ["mum@example.com", "a".repeat(101), "x".repeat(41), "<script>alert(1)</script>", "Summer Sale 2026", "a~b", "a b", "é", "a;b", "", 42, {}, null]) expect(sanitizeTag(bad as string), String(bad)).toBeNull();
    expect(sanitizeTag("  Facebook ")).toBe("facebook"); // case and surrounding space only
    expect(sanitizeTag("launch_1.v2-b")).toBe("launch_1.v2-b");
    expect(sanitizeTag("x".repeat(40))?.length).toBe(40);
  });
  it("hosts: plain DNS names only", () => {
    expect(sanitizeHost("WWW.Example.COM")).toBe("example.com");
    for (const bad of ["https://x.com", "x.com/a", "a@b.com", "localhost", "1.2.3.4", "x..com", "-x.com", "x.com:8080", "", "a".repeat(120) + ".com", 5]) expect(sanitizeHost(bad), String(bad)).toBeNull();
  });
  it("server counter names map to stored codes", () => {
    expect(eventForServerCounter("brain", "upstream_error")).toBe("brain_error");
    expect(eventForServerCounter("taste", "auth_error")).toBe("brain_error");
    expect(eventForServerCounter("brain", "bad_model_output")).toBe("brain_fallback");
    expect(eventForServerCounter("voice", "upstream_error")).toBe("voice_error");
    expect(eventForServerCounter("brain", "moderated")).toBeNull();
    expect(eventForServerCounter("other", "upstream_error")).toBeNull();
  });
});

describe("recordEvent: best effort", () => {
  beforeEach(() => resetActiveDayForTest());
  it("writes a valid event once", async () => {
    const d = deps(); await recordEvent("consent_given", { parentId: P }, d);
    expect(d.calls).toHaveLength(1);
  });
  it("does nothing when the database is not configured or the input is invalid", async () => {
    const d = deps({ configured: () => false }); await recordEvent("signup", { parentId: P }, d);
    const e = deps(); await recordEvent("signup", { parentId: "nope" }, e); await recordEvent("nope" as never, { parentId: P }, e);
    expect(d.calls).toHaveLength(0); expect(e.calls).toHaveLength(0);
  });
  it("never throws, whatever fails", async () => {
    await expect(recordEvent("signup", { parentId: P }, deps({ run: async () => { throw new Error("boom"); } }))).resolves.toBeUndefined();
    await expect(recordEvent("signup", { parentId: P }, deps({ configured: () => { throw new Error("x"); } }))).resolves.toBeUndefined();
    await expect(recordEvent("signup", { parentId: P }, deps({ run: () => { throw new Error("sync"); } }))).resolves.toBeUndefined();
  });
  it("does not wait longer than its deadline for a stuck database", async () => {
    const t = Date.now();
    await recordEvent("signup", { parentId: P }, deps({ run: () => new Promise(() => {}), deadlineMs: 40 }));
    expect(Date.now() - t).toBeLessThan(400);
  });
  it("active_day is sent once per parent per day from one instance", async () => {
    const d = deps(); const day1 = Date.parse("2026-11-24T02:00:00Z"); const day2 = day1 + 86_400_000;
    await recordActiveDay(P, day1, d); await recordActiveDay(P, day1 + 5000, d);
    expect(d.calls).toHaveLength(1);
    await recordActiveDay(P, day2, d);
    expect(d.calls).toHaveLength(2);
  });
  it("the capped INSERT carries both caps and does nothing on a repeat", () => {
    for (const [code, n] of Object.entries(CODE_CAPS)) expect(EVENT_INSERT_SQL).toContain(`when '${code}' then ${n}`);
    expect(Object.keys(CODE_CAPS).sort()).toEqual([...EVENT_CODES].sort());
    expect(EVENT_INSERT_SQL).toContain("< 1000000");
    expect(EVENT_INSERT_SQL).not.toContain("max(id)");
    expect(EVENT_INSERT_SQL).toContain("on conflict do nothing");
  });
});

describe("campaign cookie", () => {
  const own = ["gleeful.example", "localhost"];
  it("reads sanitised tags and an external referrer host only", () => {
    const c = campaignFromRequest(new URLSearchParams("utm_source=Facebook&utm_medium=cpc&utm_campaign=Launch_1"), "https://www.news.example.com/some/path?token=secret#x", own);
    expect(c).toEqual({ source: "facebook", medium: "cpc", campaign: "launch_1", refHost: "news.example.com" });
    expect(JSON.stringify(c)).not.toContain("secret");
  });
  it("our own site, bad referrers and junk give nothing", () => {
    for (const r of ["https://gleeful.example/pricing", "https://www.gleeful.example/", "not a url", "javascript:alert(1)", "ftp://x.example.com/", "https://1.2.3.4/", null]) expect(campaignFromRequest(new URLSearchParams(), r, own).refHost, String(r)).toBeNull();
    expect(campaignFromRequest(new URLSearchParams("utm_source=a%40b.com&utm_medium=" + "x".repeat(500)), null, own)).toEqual({ source: null, medium: null, campaign: null, refHost: null });
    expect(campaignFromRequest(new URLSearchParams(), "https://x.example.com/" + "a".repeat(3000), own).refHost).toBeNull();
  });
  it("encode and decode round-trip; a tampered cookie is re-sanitised or ignored", () => {
    const c = { source: "facebook", medium: null, campaign: "launch", refHost: "a.example.com" };
    expect(decodeCampaign(encodeCampaign(c))).toEqual(c);
    expect(decodeCampaign("Evil@x.com~<b>~;drop~http://x")).toEqual({ source: null, medium: null, campaign: null, refHost: null });
    expect(decodeCampaign("FaceBook~cpc~~A.Example.com")).toEqual({ source: "facebook", medium: "cpc", campaign: null, refHost: "a.example.com" });
    for (const bad of ["", "a~b", "a~b~c~d~e", "x".repeat(300), undefined, null, 5]) expect(decodeCampaign(bad as string), String(bad)).toEqual({ source: null, medium: null, campaign: null, refHost: null });
  });
  it("tags replace the cookie; a bare referrer only fills an empty one; nothing means no cookie", () => {
    const none = { source: null, medium: null, campaign: null, refHost: null };
    expect(cookieToSet(none, undefined)).toBeNull();
    expect(cookieToSet({ ...none, source: "x" }, "old~~~")).toBe("x~~~");
    expect(cookieToSet({ ...none, refHost: "a.example.com" }, "x~~~")).toBeNull();
    expect(cookieToSet({ ...none, refHost: "a.example.com" }, undefined)).toBe("~~~a.example.com");
  });
});

describe("sign-up detection", () => {
  const now = Date.parse("2026-11-24T10:00:00Z");
  it("only a freshly created account counts", () => {
    expect(isFreshAccount("2026-11-24T09:30:00Z", now)).toBe(true);
    expect(isFreshAccount("2026-11-24T07:00:00Z", now)).toBe(false);
    expect(isFreshAccount("2025-01-01T00:00:00Z", now)).toBe(false);
    for (const bad of [undefined, null, "", "garbage", 5, "2027-01-01T00:00:00Z"]) expect(isFreshAccount(bad, now), String(bad)).toBe(false);
  });
});

describe("stats shaping", () => {
  it("manila days and zero-filled health series", () => {
    expect(manilaDate(new Date("2026-11-24T17:00:00Z"))).toBe("2026-11-25");
    expect(daysBefore("2026-03-01", 1)).toBe("2026-02-28");
    const { points, totals } = shapeHealth([{ d: "2026-11-24", code: "brain_error", n: 3 }, { d: "2026-11-22", code: "voice_error", n: 1 }, { d: "2026-11-24", code: "brain_fallback", n: 2 }, { d: "2020-01-01", code: "brain_error", n: 9 }, { d: "2026-11-24", code: "signup", n: 7 }], 7, "2026-11-24");
    expect(points).toHaveLength(7); expect(points[6]).toEqual({ date: "2026-11-24", brainError: 3, brainFallback: 2, voiceError: 0 });
    expect(points[4].voiceError).toBe(1);
    expect(totals).toEqual({ brainError: 3, brainFallback: 2, voiceError: 1 });
  });
  it("sources: top 10, honest label for untagged sign-ups", () => {
    const rows = Array.from({ length: 14 }, (_, i) => ({ source: `s${i}`, kind: "campaign", n: 20 - i }));
    expect(shapeSources(rows)).toHaveLength(10);
    expect(shapeSources([{ source: null, kind: "direct", n: 4 }, { source: "x.com", kind: "weird", n: 1 }])).toEqual([{ name: "No campaign tag or referrer", kind: "direct", count: 4 }, { name: "No campaign tag or referrer", kind: "direct", count: 1 }]);
  });
});

describe("proxy: campaign cookie and CSP", () => {
  const get = (url: string, headers: Record<string, string> = {}) => proxy(new NextRequest(url, { headers }));
  const setCookie = (r: Response) => r.headers.get("set-cookie") ?? "";
  it("a landing visit with utm tags sets a hardened first-party cookie", async () => {
    const r = await get("https://gleeful.example/?utm_source=Facebook&utm_medium=cpc", { referer: "https://l.facebook.com/x?y=1" });
    const c = setCookie(r);
    expect(c).toContain(`${CAMPAIGN_COOKIE}=facebook~cpc~~l.facebook.com`);
    expect(c).toMatch(/HttpOnly/i); expect(c).toMatch(/SameSite=lax/i); expect(c).toMatch(/Secure/i); expect(c).toMatch(/Max-Age=2592000/);
  });
  it("no cookie for direct visits, own-site referrers, the lesson app, the parent area or the API", async () => {
    expect(setCookie(await get("https://gleeful.example/"))).toBe("");
    expect(setCookie(await get("https://gleeful.example/", { referer: "https://gleeful.example/pricing" }))).toBe("");
    expect(setCookie(await get("https://gleeful.example/learn?utm_source=x"))).toBe("");
    expect(setCookie(await get("https://gleeful.example/api/taste?utm_source=x"))).toBe("");
  });
  it("hostile tags never reach the cookie", async () => {
    const c = setCookie(await get("https://gleeful.example/?utm_source=" + encodeURIComponent("a@b.com") + "&utm_campaign=" + encodeURIComponent("x;y=1; Path=/evil")));
    expect(c).not.toContain("a@b.com"); expect(c).not.toContain("evil;"); expect(c).not.toContain("x;y"); expect(c).not.toContain("evil");
  });
  it("the CSP is unchanged: no new origin, still strict", () => {
    const csp = buildCsp("abc", { dev: false, https: true });
    expect(csp).not.toMatch(/vercel|va\.vercel-scripts|analytics/i);
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp.split("; ").filter((d) => /^(script-src|style-src) /.test(d)).join(" ")).not.toContain("unsafe-inline"); // only style-src-attr keeps it
  });
});

describe("Vercel Web Analytics placement", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = path.join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  it("is rendered only by the marketing layout and the sign-in layout", () => {
    const users = walk("src").filter((f) => /\.(tsx?|mjs)$/.test(f) && /PublicAnalytics|@vercel\/analytics/.test(readFileSync(f, "utf8"))).map((f) => f.split(path.sep).join("/")).sort();
    expect(users).toEqual(["src/app/(marketing)/layout.tsx", "src/app/sign-in/layout.tsx", "src/components/PublicAnalytics.tsx"]);
  });
  it("is pinned exactly and has a licence row", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.dependencies["@vercel/analytics"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(readFileSync("ASSET_LICENSES.md", "utf8")).toContain("@vercel/analytics");
  });
});

describe("checkout redirect route", () => {
  beforeEach(() => { vi.resetModules(); });
  const load = async (env: Record<string, string>, recorded: unknown[] = []) => {
    for (const k of ["PAYMENTS_MODE", "FREEMIUS_CHECKOUT_URL_SOLO", "FREEMIUS_CHECKOUT_URL_FAMILY"]) delete process.env[k];
    Object.assign(process.env, env);
    vi.doMock("@/lib/events/record", () => ({ recordEvent: async (c: string, x: unknown) => { recorded.push([c, x]); } }));
    vi.doMock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({}) }));
    vi.doMock("@/lib/auth/parent", () => ({ currentParentId: async () => P }));
    return (await import("@/app/api/checkout/route")).GET;
  };
  const req = (q: string, h: Record<string, string> = {}) => new NextRequest("https://gleeful.example/api/checkout?" + q, { headers: h });
  const ON = { PAYMENTS_MODE: "sandbox", FREEMIUS_CHECKOUT_URL_SOLO: "https://checkout.freemius.com/product/1/plan/2/", FREEMIUS_CHECKOUT_URL_FAMILY: "https://checkout.freemius.com/product/1/plan/3/" };
  it("counts the click and forwards to the configured link only", async () => {
    const rec: unknown[] = []; const GET = await load(ON, rec);
    const r = await GET(req("plan=solo&to=https://evil.example", { "sec-fetch-site": "same-origin" }));
    expect(r.status).toBe(303); expect(r.headers.get("location")).toBe(ON.FREEMIUS_CHECKOUT_URL_SOLO);
    expect(rec).toEqual([["checkout_clicked", { parentId: P }]]);
  });
  it("a cross-site request is forwarded but not counted", async () => {
    const rec: unknown[] = []; const GET = await load(ON, rec);
    expect((await GET(req("plan=family", { "sec-fetch-site": "cross-site" }))).status).toBe(303);
    expect(rec).toEqual([]);
  });
  it("404 when payments are off, the plan is unknown or the link is not a Freemius https link", async () => {
    expect((await (await load({ ...ON, PAYMENTS_MODE: "off" }))(req("plan=solo"))).status).toBe(404);
    expect((await (await load(ON))(req("plan=gold"))).status).toBe(404);
    expect((await (await load({ ...ON, FREEMIUS_CHECKOUT_URL_SOLO: "https://evil.example/x" }))(req("plan=solo"))).status).toBe(404);
  });
});

describe("brain route: active day", () => {
  it("is noted once for a signed-in parent, never for a tester passcode, and a failing counter changes nothing", async () => {
    const { handleBrain, makeDeps } = await import("@/lib/brain/server/handler");
    const { MemoryUsageStore } = await import("@/lib/brain/server/limits");
    const model = async () => new Response(JSON.stringify({ content: [{ type: "text", text: "Good question! Let's look." }], usage: { input_tokens: 5, output_tokens: 5 } }), { status: 200 });
    const body = { v: 1, learnerId: "learner_1", sessionId: "sess_1", tz: "Asia/Manila", world: "mars", teacher: "leo", session: 1, input: { kind: "text", text: "why is it red?" }, hintsUsed: 0, history: [], skills: [] };
    const http = () => new Request("https://gleeful.test/api/brain", { method: "POST", headers: { "content-type": "application/json", host: "gleeful.test", "x-forwarded-for": "203.0.113.7" }, body: JSON.stringify(body) });
    const seen: string[] = [];
    const d = makeDeps({ env: { apiKey: "test-key-not-real-0000", disabled: false }, parent: async () => ({ id: P, consented: true }), usage: new MemoryUsageStore(), fetchImpl: model as unknown as typeof fetch, noteActive: async (id) => { seen.push(id); }, log: () => {} });
    expect((await handleBrain(http(), d)).status).toBe(200);
    expect(seen).toEqual([P]);
    const bad = makeDeps({ env: { apiKey: "test-key-not-real-0000", disabled: false }, parent: async () => ({ id: P, consented: true }), usage: new MemoryUsageStore(), fetchImpl: model as unknown as typeof fetch, noteActive: async () => { throw new Error("db down"); }, log: () => {} });
    expect((await handleBrain(http(), bad)).status).toBe(200);
    const noConsent = makeDeps({ env: { apiKey: "test-key-not-real-0000", disabled: false }, parent: async () => ({ id: P, consented: false }), usage: new MemoryUsageStore(), fetchImpl: model as unknown as typeof fetch, noteActive: async (id) => { seen.push("x" + id); }, log: () => {} });
    expect((await handleBrain(http(), noConsent)).status).toBe(403);
    expect(seen).toEqual([P]);
  });
});

describe("writes that must not hold a response", () => {
  it("recordActiveDay remembers a parent only after a successful write, so a failed one is retried", async () => {
    resetActiveDayForTest();
    const now = Date.parse("2026-11-24T02:00:00Z");
    let fail = true; const calls: unknown[] = [];
    const d = deps({ run: async (e) => { calls.push(e); if (fail) throw new Error("db down"); } });
    await recordActiveDay(P, now, d);
    fail = false;
    await recordActiveDay(P, now + 1000, d); // retried
    await recordActiveDay(P, now + 2000, d); // now remembered
    expect(calls).toHaveLength(2);
    const slow = deps({ run: () => new Promise(() => {}), deadlineMs: 20 }); // a timeout is not a success either
    resetActiveDayForTest(); await recordActiveDay(P, now, slow); await recordActiveDay(P, now, slow);
    expect(slow.calls).toHaveLength(0);
  });
  it("error writes are throttled to one per code per 10 seconds per instance", async () => {
    vi.doUnmock("@/lib/events/record"); vi.resetModules();
    const { errorWriteAllowed, resetErrorThrottleForTest, ERROR_WRITE_GAP_MS } = await import("@/lib/events/record");
    resetErrorThrottleForTest();
    expect(errorWriteAllowed("brain_error", 1000)).toBe(true);
    expect(errorWriteAllowed("brain_error", 1000 + ERROR_WRITE_GAP_MS - 1)).toBe(false);
    expect(errorWriteAllowed("voice_error", 1500)).toBe(true); // its own code
    expect(errorWriteAllowed("brain_error", 1000 + ERROR_WRITE_GAP_MS)).toBe(true);
  });
  it("sign-up, consent, child added and checkout go through later(), never an awaited write", () => {
    for (const f of ["src/app/auth/callback/route.ts", "src/app/parent/actions.ts", "src/app/api/checkout/route.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/await recordEvent\(/);
      expect(src, f).toMatch(/later\(\(\) => recordEvent\(/);
    }
  });
  it("later() runs the task right away outside a request and never throws", async () => {
    const { later } = await import("@/lib/events/later");
    let ran = 0; later(async () => { ran++; });
    later(async () => { throw new Error("x"); });
    await new Promise((r) => setTimeout(r, 10));
    expect(ran).toBe(1);
  });
});
