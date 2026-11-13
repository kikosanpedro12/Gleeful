import { describe, expect, it, vi } from "vitest";
import { safeNext } from "@/lib/auth/safeNext";
import { cleanEmail, cleanNickname, parseLearnerInput, passwordProblem, PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/validate";
import { handleSignIn, makeSignInDeps, MESSAGES, SIGNIN_LIMITS, type AuthPort } from "@/lib/auth/signin";
import { claimsToParentId } from "@/lib/auth/parent";
import { looksLikeSecretKey, readSupabasePublicEnv } from "@/lib/supabase/env";
import { CONSENT_POINTS, CONSENT_VERSION, CONSENT_VERSION_RE } from "@/lib/consent/text";
import { RateLimiter } from "@/lib/brain/server/limits";
import { crossOrigin } from "@/lib/http/request";

describe("safeNext: never an open redirect", () => {
  it("allows only our own pages, as plain paths", () => {
    expect(safeNext("/parent")).toBe("/parent");
    expect(safeNext("/learn")).toBe("/learn");
    expect(safeNext("/learn/")).toBe("/learn");
    expect(safeNext("/parent?x=1#y")).toBe("/parent"); // query and fragment are dropped
  });
  it("falls back for everything else", () => {
    const bad = [
      undefined, null, 5, "", "parent", "//evil.example", "///evil.example", "/\\evil.example", "\\\\evil.example", "/%2f%2fevil.example",
      "https://evil.example", "http://gleeful.test/parent", "javascript:alert(1)", "data:text/html,x", "/parent\n/evil", "/parent\r\nSet-Cookie: x=1",
      "/admin", "/api/brain", "/tester", "/auth/callback", "/../parent", "/parent/../api", "/PARENT", "/" + "a".repeat(300), "/\t/evil.example", " /parent", "/parent ",
    ];
    for (const b of bad) expect(safeNext(b), String(b)).toBe("/parent");
  });
  it("uses the caller's fallback", () => expect(safeNext("//x", "/learn")).toBe("/learn"));
});

describe("input rules", () => {
  it("emails: trimmed, lower-cased, sane", () => {
    expect(cleanEmail("  Parent@Example.COM ")).toBe("parent@example.com");
    for (const bad of ["", "a@b", "no at.com", "a b@c.com", "@x.com", "a@@b.com", 5, null, "x".repeat(260) + "@a.com"]) expect(cleanEmail(bad), String(bad)).toBeNull();
  });
  it("passwords: length rules by bytes, fixed wording that never echoes the input", () => {
    expect(passwordProblem("a".repeat(PASSWORD_MIN))).toBeNull();
    expect(passwordProblem("a".repeat(PASSWORD_MIN - 1))).toMatch(/at least/);
    expect(passwordProblem("a".repeat(PASSWORD_MAX))).toBeNull();
    expect(passwordProblem("a".repeat(PASSWORD_MAX + 1))).toMatch(/at most/);
    expect(passwordProblem("é".repeat(40))).toMatch(/at most/); // 80 bytes
    expect(passwordProblem(undefined)).toMatch(/Enter/);
    expect(passwordProblem("hunter2")).not.toContain("hunter2");
  });
  it("nicknames: 1-40 characters, control characters stripped, spaces collapsed", () => {
    expect(cleanNickname("  Mia   Rose ")).toBe("Mia Rose");
    expect(cleanNickname("A\u0000B\u0007")).toBe("AB");
    for (const bad of ["", "   ", "x".repeat(41), 7, null, "\u0000\u0001"]) expect(cleanNickname(bad), String(bad)).toBeNull();
  });
  it("learner form: grade 0 (kindergarten) to 12, teacher leo or mia, nothing else", () => {
    const f = (o: Record<string, unknown>) => parseLearnerInput((k) => o[k]);
    expect(f({ nickname: "Kai", grade: "0", preferred_teacher: "mia" })).toEqual({ ok: true, value: { nickname: "Kai", grade: 0, preferred_teacher: "mia" } });
    expect(f({ nickname: "Kai", grade: "12", preferred_teacher: "leo" }).ok).toBe(true);
    for (const grade of ["13", "-1", "3.5", "abc", "", "1e1", 5 as unknown as string]) expect(f({ nickname: "Kai", grade, preferred_teacher: "leo" }).ok, String(grade)).toBe(false);
    expect(f({ nickname: "Kai", grade: "3", preferred_teacher: "evil" }).ok).toBe(false);
    expect(f({ nickname: "", grade: "3", preferred_teacher: "leo" }).ok).toBe(false);
  });
});

describe("sign-in route logic", () => {
  const http = (body: unknown, headers: Record<string, string> = {}) =>
    new Request("https://gleeful.test/auth/sign-in", { method: "POST", headers: { "content-type": "application/json", host: "gleeful.test", "x-forwarded-for": "203.0.113.5", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
  const port = (over: Partial<AuthPort> = {}): AuthPort & { calls: string[] } => {
    const calls: string[] = [];
    return {
      calls,
      signInWithPassword: vi.fn(async (e: string) => { calls.push(`pw:${e}`); return e === "known@example.com"; }),
      signInWithOtp: vi.fn(async (e: string, r: string) => { calls.push(`otp:${e}|${r}`); }),
      signUp: vi.fn(async (e: string, _p: string, r: string) => { calls.push(`up:${e}|${r}`); }),
      ...over,
    };
  };
  const deps = (p: AuthPort | null, now = () => 1_000_000) => makeSignInDeps({ port: p, siteUrl: "https://gleeful.test/", now, log: () => {} });
  const j = async (r: Response) => (await r.json()) as { ok: boolean; message?: string; next?: string };

  it("accounts off: 503 with an honest message, nothing called", async () => {
    const r = await handleSignIn(http({ mode: "magic", email: "a@b.co" }), deps(null));
    expect(r.status).toBe(503);
    expect((await j(r)).message).toBe(MESSAGES.unavailable);
  });
  it("magic link: same answer for a known and an unknown address (no enumeration); the link goes to OUR callback with a safe next", async () => {
    const p = port();
    const a = await handleSignIn(http({ mode: "magic", email: "known@example.com", next: "/learn" }), deps(p));
    const b = await handleSignIn(http({ mode: "magic", email: "stranger@example.com", next: "/learn" }), deps(p));
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect(await j(a)).toEqual(await j(b));
    expect(p.calls[0]).toBe("otp:known@example.com|https://gleeful.test/auth/callback?next=%2Flearn");
  });
  it("a hostile next is replaced, never forwarded to the email link", async () => {
    const p = port();
    await handleSignIn(http({ mode: "magic", email: "a@example.com", next: "https://evil.example/x" }), deps(p));
    expect(p.calls[0]).toBe("otp:a@example.com|https://gleeful.test/auth/callback?next=%2Fparent");
  });
  it("sign-up: same answer whether or not the account exists; weak passwords are told how, without echoing them", async () => {
    const p = port();
    const ok = await handleSignIn(http({ mode: "signup", email: "known@example.com", password: "correct-horse-battery" }), deps(p));
    const ok2 = await handleSignIn(http({ mode: "signup", email: "new@example.com", password: "correct-horse-battery" }), deps(p));
    expect(await j(ok)).toEqual(await j(ok2));
    const weak = await handleSignIn(http({ mode: "signup", email: "w@example.com", password: "short" }), deps(p));
    expect(weak.status).toBe(400);
    expect(JSON.stringify(await j(weak))).not.toContain("short\"");
    expect(p.calls.filter((c) => c.startsWith("up:")).length).toBe(2);
  });
  it("password sign-in: success returns a safe next; failure is one generic message whoever is wrong", async () => {
    const p = port();
    const good = await handleSignIn(http({ mode: "password", email: "known@example.com", password: "whatever-it-is", next: "/learn" }), deps(p));
    expect(await j(good)).toEqual({ ok: true, next: "/learn" });
    const bad1 = await handleSignIn(http({ mode: "password", email: "known@example.com", password: "wrong" }), { ...deps(p), port: port({ signInWithPassword: async () => false }) });
    const bad2 = await handleSignIn(http({ mode: "password", email: "nobody@example.com", password: "wrong" }), deps(p));
    expect(bad1.status).toBe(401); expect(bad2.status).toBe(401);
    const m1 = await j(bad1);
    expect(m1).toEqual(await j(bad2));
    expect(m1.message).toBe(MESSAGES.badLogin);
  });
  it("a provider error never becomes a different answer or a 500 (and nothing personal is logged)", async () => {
    const log = vi.fn();
    const boom = port({ signInWithOtp: async () => { throw new Error("rate limit for secret@example.com"); }, signInWithPassword: async () => { throw new Error("db down"); } });
    const d = { ...deps(boom), log };
    const m = await handleSignIn(http({ mode: "magic", email: "secret@example.com" }), d);
    expect(m.status).toBe(200);
    const p = await handleSignIn(http({ mode: "password", email: "secret@example.com", password: "pw-pw-pw-pw-pw" }), d);
    expect(p.status).toBe(401);
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret@example.com");
  });
  it("refuses other sites, non-JSON, junk and oversize bodies, and bad modes or emails", async () => {
    const p = port();
    expect((await handleSignIn(http({ mode: "magic", email: "a@example.com" }, { origin: "https://evil.example" }), deps(p))).status).toBe(403);
    expect((await handleSignIn(http({ mode: "magic", email: "a@example.com" }, { "sec-fetch-site": "cross-site" }), deps(p))).status).toBe(403);
    expect((await handleSignIn(http("x", { "content-type": "text/plain" }), deps(p))).status).toBe(415);
    expect((await handleSignIn(http("not json"), deps(p))).status).toBe(400);
    expect((await handleSignIn(http("[]"), deps(p))).status).toBe(400);
    expect((await handleSignIn(http("x".repeat(SIGNIN_LIMITS.maxBody + 1)), deps(p))).status).toBe(413);
    expect((await handleSignIn(http({ mode: "admin", email: "a@example.com" }), deps(p))).status).toBe(400);
    expect((await handleSignIn(http({ mode: "magic", email: "nope" }), deps(p))).status).toBe(400);
    expect(p.calls).toEqual([]);
  });
  it("brakes: one address cannot be mail-bombed, and one client cannot try endlessly", async () => {
    const p = port();
    const d = deps(p);
    const codes: number[] = [];
    for (let i = 0; i < SIGNIN_LIMITS.perEmail + 2; i++) codes.push((await handleSignIn(http({ mode: "magic", email: "victim@example.com" }), d)).status);
    expect(codes.slice(0, SIGNIN_LIMITS.perEmail).every((c) => c === 200)).toBe(true);
    expect(codes.slice(SIGNIN_LIMITS.perEmail)).toEqual([429, 429]);
    const d2 = deps(port());
    const ipCodes: number[] = [];
    for (let i = 0; i < SIGNIN_LIMITS.perIp + 3; i++) ipCodes.push((await handleSignIn(http({ mode: "password", email: `u${i}@example.com`, password: "pw-pw-pw-pw-pw" }), d2)).status);
    expect(ipCodes).toContain(429);
    const limited = await handleSignIn(http({ mode: "magic", email: "z@example.com" }), d2);
    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
  });
  it("the per-address table is bounded and refuses new keys when full (never evicts a live one)", () => {
    const rl = new RateLimiter(3, 60_000, 2);
    expect(rl.take("a", 0)).toBe(0); expect(rl.take("b", 0)).toBe(0);
    expect(rl.take("c", 1)).toBeGreaterThan(0);
    expect(rl.take("a", 2)).toBe(0);
  });
  it("crossOrigin: same-origin and no-header requests pass, other sites do not", () => {
    const r = (h: Record<string, string>) => new Request("https://gleeful.test/x", { method: "POST", headers: { host: "gleeful.test", ...h } });
    expect(crossOrigin(r({}))).toBe(false);
    expect(crossOrigin(r({ origin: "https://gleeful.test" }))).toBe(false);
    expect(crossOrigin(r({ origin: "https://evil.example" }))).toBe(true);
    expect(crossOrigin(r({ "sec-fetch-site": "same-site" }))).toBe(true);
    expect(crossOrigin(r({ origin: "null" }))).toBe(true);
  });
});

describe("session claims and Supabase settings", () => {
  const sub = "123e4567-e89b-42d3-a456-426614174000";
  it("only a verified, non-anonymous, authenticated user with a uuid is a parent", () => {
    expect(claimsToParentId({ sub, role: "authenticated" })).toBe(sub);
    expect(claimsToParentId({ sub: sub.toUpperCase(), role: "authenticated" })).toBe(sub);
    for (const bad of [null, undefined, "x", {}, { sub }, { sub, role: "anon" }, { sub, role: "service_role" }, { sub, role: "authenticated", is_anonymous: true }, { sub: "not-a-uuid", role: "authenticated" }, { sub: 5, role: "authenticated" }])
      expect(claimsToParentId(bad), JSON.stringify(bad)).toBeNull();
  });
  const jwt = (role: string) => `h.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.s`;
  it("a secret key is never accepted as the public key", () => {
    expect(looksLikeSecretKey("sb_secret_abc")).toBe(true);
    expect(looksLikeSecretKey(jwt("service_role"))).toBe(true);
    expect(looksLikeSecretKey(jwt("anon"))).toBe(false);
    expect(looksLikeSecretKey("sb_publishable_abc")).toBe(false);
    expect(readSupabasePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_abc" })).toBeNull();
    expect(readSupabasePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt("service_role") })).toBeNull();
  });
  it("settings: both needed, https only (localhost excepted), normalised to the origin", () => {
    expect(readSupabasePublicEnv({})).toBeNull();
    expect(readSupabasePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" })).toBeNull();
    expect(readSupabasePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_k" })).toBeNull();
    expect(readSupabasePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "not a url", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_k" })).toBeNull();
    expect(readSupabasePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co/rest/v1/", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: " sb_publishable_k " })).toEqual({ url: "https://x.supabase.co", key: "sb_publishable_k" });
    expect(readSupabasePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k" })).not.toBeNull();
  });
});

describe("consent wording", () => {
  const all = CONSENT_POINTS.join(" ");
  it("the version fits the database check", () => expect(CONSENT_VERSION).toMatch(CONSENT_VERSION_RE));
  it("says what a parent needs to know to agree: who, what is stored, the AI service, voice, withdrawal and deletion", () => {
    expect(all).toMatch(/parent or legal guardian/);
    expect(all).toMatch(/nickname/);
    expect(all).toMatch(/Anthropic/);
    expect(all).toMatch(/Voice is not collected/);
    expect(all).toMatch(/withdraw/);
    expect(all).toMatch(/delete/);
  });
  it("promises nothing the product does not do: no audio, no surname, no stored messages", () => {
    expect(all).toMatch(/does not store a surname/);
    expect(all).toMatch(/audio or recordings/);
    expect(all).toMatch(/does not save those messages/);
  });
});
