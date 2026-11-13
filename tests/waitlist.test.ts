import { describe, expect, it, vi } from "vitest";
import { handleWaitlist, makeWaitlistDeps, normaliseEmail, readWaitlistEnv, type WaitlistDeps } from "@/lib/waitlist/server";
import { RateLimiter } from "@/lib/brain/server/limits";

const ENV = { url: "https://proj.supabase.co", secretKey: "sb_secret_test_value" };
function deps(over: Partial<WaitlistDeps> = {}) {
  const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }));
  const log = vi.fn();
  const d = makeWaitlistDeps({ env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch, log, ...over });
  return { d, fetchImpl, log };
}
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://gleeful.test/api/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json", host: "gleeful.test", "sec-fetch-site": "same-origin", "x-forwarded-for": "203.0.113.9", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /api/waitlist", () => {
  it("stores a lowercased email with consent, via the secret key, ignoring duplicates", async () => {
    const { d, fetchImpl } = deps();
    const res = await handleWaitlist(req({ email: "  Parent@Example.COM ", consent: true }), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://proj.supabase.co/rest/v1/waitlist?on_conflict=email");
    const h = init.headers as Record<string, string>;
    expect(h.apikey).toBe(ENV.secretKey);
    expect(h.authorization).toBeUndefined();
    expect(h.prefer).toContain("ignore-duplicates");
    expect(JSON.parse(String(init.body))).toEqual({ email: "parent@example.com", consent: true, source: "landing" });
  });
  it("a legacy JWT service key also goes in Authorization", async () => {
    const { d, fetchImpl } = deps({ env: { ...ENV, secretKey: "eyJhbGciOi.fake.jwt" } });
    await handleWaitlist(req({ email: "a@example.com", consent: true }), d);
    const h = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(h.authorization).toBe("Bearer eyJhbGciOi.fake.jwt");
  });
  it("a repeat sign-up looks identical to a new one", async () => {
    const { d } = deps({ fetchImpl: (async () => new Response(null, { status: 409 })) as unknown as typeof fetch });
    const res = await handleWaitlist(req({ email: "a@example.com", consent: true }), d);
    expect(res.status).toBe(200);
  });
  it("refuses without consent, with a bad email, or wrong shape, without calling Supabase", async () => {
    for (const [body, code] of [
      [{ email: "a@example.com", consent: false }, "consent_required"],
      [{ email: "a@example.com", consent: "true" }, "consent_required"],
      [{ email: "nope", consent: true }, "invalid_email"],
      [{ email: ["a@example.com"], consent: true }, "invalid_email"],
      [[1, 2], "bad_request"],
      ["{not json", "bad_request"],
    ] as const) {
      const { d, fetchImpl } = deps();
      const res = await handleWaitlist(req(body), d);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(code);
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });
  it("blocks other sites and non-JSON posts", async () => {
    const { d, fetchImpl } = deps();
    expect((await handleWaitlist(req({ email: "a@example.com", consent: true }, { "sec-fetch-site": "cross-site" }), d)).status).toBe(403);
    expect((await handleWaitlist(req({ email: "a@example.com", consent: true }, { "sec-fetch-site": "", origin: "https://evil.example" }), d)).status).toBe(403);
    expect((await handleWaitlist(req("email=a@example.com", { "content-type": "application/x-www-form-urlencoded" }), d)).status).toBe(415);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("caps the body size", async () => {
    const { d } = deps();
    const res = await handleWaitlist(req({ email: "a@example.com", consent: true, pad: "x".repeat(5000) }), d);
    expect(res.status).toBe(413);
  });
  it("rate limits per address", async () => {
    const { d } = deps({ limiter: new RateLimiter(2, 3_600_000) });
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await handleWaitlist(req({ email: `a${i}@example.com`, consent: true }), d)).status);
    expect(codes).toEqual([200, 200, 429]);
  });
  it("honeypot: bots get a success but nothing is stored", async () => {
    const { d, fetchImpl } = deps();
    const res = await handleWaitlist(req({ email: "bot@example.com", consent: true, website: "http://spam" }), d);
    expect(res.status).toBe(200);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("without Supabase keys it says the waitlist is not open yet (503)", async () => {
    const { d } = deps({ env: { url: null, secretKey: null } });
    const res = await handleWaitlist(req({ email: "a@example.com", consent: true }), d);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("unconfigured");
  });
  it("upstream failure is a 502 and never logs or echoes the email", async () => {
    const { d, log } = deps({ fetchImpl: (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch });
    const spy = vi.spyOn(console, "warn");
    const res = await handleWaitlist(req({ email: "secret.parent@example.com", consent: true }), d);
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).not.toContain("secret.parent");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret.parent");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("secret.parent");
    spy.mockRestore();
  });
  it("normaliseEmail and env parsing", () => {
    expect(normaliseEmail(" A.B+c@Mail.Example.org ")).toBe("a.b+c@mail.example.org");
    expect(normaliseEmail("a@b")).toBeNull();
    expect(normaliseEmail(`${"a".repeat(250)}@x.com`)).toBeNull();
    expect(readWaitlistEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://evil.example", SUPABASE_SECRET_KEY: "k" } as unknown as NodeJS.ProcessEnv).url).toBeNull();
    expect(readWaitlistEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://p.supabase.co/rest", SUPABASE_SECRET_KEY: " k " } as unknown as NodeJS.ProcessEnv)).toEqual({ url: "https://p.supabase.co", secretKey: "k" });
  });
});
