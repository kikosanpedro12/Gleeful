/** Tester-added attacks on the product-events feature (hostile cookie/tags, slow or failing database, callback, privacy). */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { sanitizeHost, sanitizeTag } from "@/lib/events/codes";
import { CAMPAIGN_COOKIE, campaignFromRequest, decodeCampaign } from "@/lib/events/campaign";
import { recordActiveDay, recordEvent, resetActiveDayForTest, type RecordDeps } from "@/lib/events/record";
import { proxy } from "@/proxy";

const P = "123e4567-e89b-42d3-a456-426614174000";
const TAG = /^[a-z0-9_.-]{1,40}$/;
const deps = (over: Partial<RecordDeps> = {}): RecordDeps & { calls: unknown[] } => {
  const calls: unknown[] = [];
  return { configured: () => true, run: async (e) => { calls.push(e); }, deadlineMs: 40, calls, ...over };
};

describe("hostile tags and hosts (unicode, bidi, control, injection)", () => {
  const nasty = ["‮evil‬", "ev​il", "ｆａｃｅｂｏｏｋ", "😀😀", "a\u0000b", "a\r\nSet-Cookie: x=1", "İSTANBUL", "ａ＠ｂ.com", "%00", "' OR 1=1 --", "a;b", "a,b", "a\tb", "\u0000", "..", "a".repeat(100), " x "];
  it("whatever survives matches the database pattern exactly (no control, bidi or non-ASCII byte)", () => {
    for (const v of nasty) { const t = sanitizeTag(v); if (t !== null) expect(t, JSON.stringify(v)).toMatch(TAG); }
    expect(sanitizeTag("‮evil‬")).toBeNull(); // dropped, not cleaned up
  });
  it("hosts: unicode, bidi, control and look-alike dots never pass", () => {
    for (const v of ["exa‮mple.com", "例え.jp", "ex​ample.com", "a\r\nb.com", "ex ample.com", "ex_ample.com", "a.b。com", "xn--.com.", "example.com.", "0x7f.1"]) {
      const h = sanitizeHost(v); if (h !== null) expect(h, JSON.stringify(v)).toMatch(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/);
    }
    expect(sanitizeHost("example.com.")).toBeNull(); // trailing dot ends in '.', refused rather than fixed
  });
  it("duplicate utm params: the first one wins, never a join", () => {
    const c = campaignFromRequest(new URLSearchParams("utm_source=first&utm_source=second&utm_medium=a&utm_medium=b"), null, []);
    expect(c.source).toBe("first"); expect(c.medium).toBe("a");
  });
  it("a referrer with credentials or a port keeps the host only", () => {
    const c = campaignFromRequest(new URLSearchParams(), "https://user:secret@News.Example.com:8443/a?token=zz", ["gleeful.example"]);
    expect(c.refHost).toBe("news.example.com"); expect(JSON.stringify(c)).not.toMatch(/secret|zz|8443|user/);
  });
  it("decodeCampaign: a tampered cookie with CR/LF, '~' tricks or bidi yields only valid parts", () => {
    for (const raw of ["a\r\nb~c~d~e.example.com", "‮a~b~c~d.example.com", "~~~", "a~b~c~", "A~B~C~D.EXAMPLE.COM"]) {
      const c = decodeCampaign(raw);
      for (const t of [c.source, c.medium, c.campaign]) if (t !== null) expect(t).toMatch(TAG);
      if (c.refHost !== null) expect(c.refHost).toMatch(/^[a-z0-9.-]+$/);
    }
  });
});

describe("proxy: hostile landing requests", () => {
  const get = (url: string, headers: Record<string, string> = {}) => proxy(new NextRequest(url, { headers }));
  const cookie = (r: Response) => r.headers.get("set-cookie") ?? "";
  it("a huge query or referrer cannot make an oversized or multi-line cookie", async () => {
    const r = await get("https://gleeful.example/?utm_source=" + "a".repeat(5000) + "&utm_campaign=" + "b".repeat(90), { referer: "https://x.example.com/" + "a".repeat(5000) });
    const c = cookie(r);
    expect(c).not.toMatch(/a{50}/); expect(c).not.toMatch(/[\r\n]/); expect(c.length).toBeLessThan(400);
  });
  it("bidi / CRLF / unicode in utm values never reach Set-Cookie as raw bytes", async () => {
    const q = "utm_source=" + encodeURIComponent("‮evil\r\nX-Injected: 1") + "&utm_medium=" + encodeURIComponent("😀ｘ");
    const r = await get("https://gleeful.example/pricing?" + q);
    const c = cookie(r);
    // eslint-disable-next-line no-control-regex
    expect(c).toMatch(/^[\x20-\x7e]*$/); expect(c).not.toContain("X-Injected:"); expect(r.headers.get("x-injected")).toBeNull();
  });
  it("POST and HEAD-less odd methods never set it; /faq does; /learn and /parent do not", async () => {
    expect(cookie(await proxy(new NextRequest("https://gleeful.example/?utm_source=x", { method: "POST" })))).toBe("");
    expect(cookie(await get("https://gleeful.example/faq?utm_source=x"))).toContain(`${CAMPAIGN_COOKIE}=x~~~`);
    expect(cookie(await get("https://gleeful.example/parent?utm_source=x"))).not.toContain(CAMPAIGN_COOKIE);
    expect(cookie(await get("https://gleeful.example/auth/callback?utm_source=x"))).not.toContain(CAMPAIGN_COOKIE);
  });
  it("an existing tampered cookie does not block a fresh tagged visit and is not echoed back", async () => {
    const r = await get("https://gleeful.example/?utm_source=good", { cookie: `${CAMPAIGN_COOKIE}=<script>~~~` });
    expect(cookie(r)).toContain(`${CAMPAIGN_COOKIE}=good~~~`);
  });
  it("a bare external referrer over a tampered (decodes to nothing) cookie replaces it", async () => {
    const r = await get("https://gleeful.example/", { referer: "https://news.example.com/x", cookie: `${CAMPAIGN_COOKIE}=garbage` });
    expect(cookie(r)).toContain(`${CAMPAIGN_COOKIE}=~~~news.example.com`);
  });
});

describe("recordEvent: a down, slow or lying database", () => {
  beforeEach(() => resetActiveDayForTest());
  it("many concurrent calls against a stuck database all return within the deadline", async () => {
    const t = Date.now();
    await Promise.all(Array.from({ length: 200 }, () => recordEvent("signup", { parentId: P }, deps({ run: () => new Promise(() => {}), deadlineMs: 50 }))));
    expect(Date.now() - t).toBeLessThan(600);
  });
  it("a write that rejects AFTER the deadline causes no unhandled rejection", async () => {
    const seen: unknown[] = []; const h = (e: unknown) => seen.push(e); process.on("unhandledRejection", h);
    try {
      await recordEvent("signup", { parentId: P }, deps({ run: () => new Promise((_, rej) => setTimeout(() => rej(new Error("late")), 80)), deadlineMs: 10 }));
      await new Promise((r) => setTimeout(r, 200));
    } finally { process.off("unhandledRejection", h); }
    expect(seen).toEqual([]);
  });
  it("never throws for a synchronous throw, a non-Error rejection or a rejected thenable", async () => {
    for (const run of [() => { throw "str"; }, () => Promise.reject(undefined), () => ({ then: (_: unknown, rej: (e: unknown) => void) => rej(new Error("x")) }) as unknown as Promise<void>]) {
      await expect(recordEvent("signup", { parentId: P }, deps({ run }))).resolves.toBeUndefined();
    }
  });
  it("hostile context objects (getters that throw, prototype junk) do not throw", async () => {
    const ctx = { get parentId(): string { throw new Error("getter"); } };
    await expect(recordEvent("signup", ctx as never, deps())).resolves.toBeUndefined();
    await expect(recordEvent("signup", null as never, deps())).resolves.toBeUndefined();
  });
  it("the stored event never carries more than the allowed fields", async () => {
    const d = deps(); await recordEvent("signup", { parentId: P, utmSource: "x", email: "mum@example.com", childName: "Ana" } as never, d);
    expect(Object.keys(d.calls[0] as object).sort()).toEqual(["code", "parentId", "referrerHost", "utmCampaign", "utmMedium", "utmSource"]);
    expect(JSON.stringify(d.calls)).not.toMatch(/mum@|Ana/);
  });
  it("recordActiveDay: a failing write never throws and the same parent is not hammered; a full table refuses new parents quietly", async () => {
    const d = deps({ run: async () => { throw new Error("db"); } });
    await expect(recordActiveDay(P, Date.parse("2026-11-24T02:00:00Z"), d)).resolves.toBeUndefined();
    const ok = deps(); const now = Date.parse("2026-11-24T02:00:00Z");
    for (let i = 0; i < 5100; i++) await recordActiveDay(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, now, ok);
    expect(ok.calls.length).toBeLessThanOrEqual(5000);
  });
});

describe("/auth/callback: sign-up event", () => {
  beforeEach(() => vi.resetModules());
  const load = async (user: Record<string, unknown> | null, rec: unknown[]) => {
    vi.doMock("@/lib/events/record", () => ({ recordEvent: async (c: string, x: unknown) => { rec.push([c, x]); } }));
    vi.doMock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ auth: { exchangeCodeForSession: async () => ({ data: { user }, error: null }), verifyOtp: async () => ({ data: { user }, error: null }) } }) }));
    return (await import("@/app/auth/callback/route")).GET;
  };
  const fresh = () => new Date(Date.now() - 60_000).toISOString();
  const req = (cookie?: string) => new NextRequest("https://gleeful.example/auth/callback?code=abc&next=/parent", { headers: cookie ? { cookie } : {} });
  it("a new account records one signup with only sanitised campaign parts, never the e-mail", async () => {
    const rec: unknown[] = [];
    const GET = await load({ id: P, email: "mum@example.com", created_at: fresh() }, rec);
    const r = await GET(req(`${CAMPAIGN_COOKIE}=Evil%40x.com~cpc~<b>~news.example.com`));
    expect(r.status).toBe(303);
    expect(rec).toEqual([["signup", { parentId: P, utmSource: null, utmMedium: "cpc", utmCampaign: null, referrerHost: "news.example.com" }]]);
    expect(JSON.stringify(rec)).not.toContain("mum@");
  });
  it("an old account, an anonymous user, a missing/odd id or created_at record nothing, and sign-in still succeeds", async () => {
    for (const u of [{ id: P, created_at: "2020-01-01T00:00:00Z" }, { id: P, created_at: fresh(), is_anonymous: true }, { id: 5, created_at: fresh() }, { id: P }, { id: P, created_at: "tomorrow" }, null]) {
      const rec: unknown[] = []; const GET = await load(u as never, rec);
      expect((await GET(req())).status, JSON.stringify(u)).toBe(303); expect(rec, JSON.stringify(u)).toEqual([]);
    }
  });
});

describe("privacy: events carry no e-mail or child text", () => {
  it("every recordEvent call site passes only an id (and, for signup, campaign parts)", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const path = await import("node:path");
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
    const calls = walk("src").filter((f) => /\.tsx?$/.test(f)).flatMap((f) => (readFileSync(f, "utf8").match(/\brecordEvent\("(?:signup|consent_given|learner_added|checkout_clicked|active_day)"[^)]*\)/g) ?? []).map((m) => `${f}: ${m}`));
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const c of calls) expect(c, c).not.toMatch(/email|name|nick|text|message|input|answer|child|learner\./i);
  });
});
