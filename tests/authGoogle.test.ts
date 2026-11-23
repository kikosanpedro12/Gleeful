import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const oauth = vi.fn();
let client: unknown = null;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => client }));

import { GET } from "@/app/auth/google/route";

const req = (qs = "", ip = "203.0.113.7") => new NextRequest(`https://gleeful.test/auth/google${qs}`, { headers: { "x-forwarded-for": ip } });

describe("GET /auth/google", () => {
  beforeEach(() => {
    oauth.mockReset();
    client = { auth: { signInWithOAuth: oauth } };
    process.env.NEXT_PUBLIC_SITE_URL = "https://getgleeful.com";
  });

  it("redirects to the provider URL Supabase returns, with a return address on OUR site and a safe next", async () => {
    oauth.mockResolvedValue({ data: { url: "https://proj.supabase.co/auth/v1/authorize?provider=google" }, error: null });
    const res = await GET(req("?next=%2Fparent", "198.51.100.1"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://proj.supabase.co/auth/v1/authorize?provider=google");
    const arg = oauth.mock.calls[0][0];
    expect(arg.provider).toBe("google");
    expect(arg.options.redirectTo).toBe("https://getgleeful.com/auth/callback?next=%2Fparent");
    expect(arg.options.skipBrowserRedirect).toBe(true);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("a hostile next never leaves the site", async () => {
    oauth.mockResolvedValue({ data: { url: "https://proj.supabase.co/x" }, error: null });
    await GET(req("?next=https%3A%2F%2Fevil.example%2F", "198.51.100.2"));
    expect(oauth.mock.calls[0][0].options.redirectTo).not.toContain("evil");
  });

  it("every failure looks the same: back to /sign-in?error=google", async () => {
    oauth.mockResolvedValue({ data: { url: null }, error: new Error("provider disabled") });
    const a = await GET(req("", "198.51.100.3"));
    oauth.mockResolvedValue({ data: { url: "http://insecure.example/x" }, error: null });
    const b = await GET(req("", "198.51.100.4"));
    client = null;
    const c = await GET(req("", "198.51.100.5"));
    for (const r of [a, b, c]) expect(r.headers.get("location")).toContain("/sign-in?error=google");
  });

  it("the brake stops a flood from one address", async () => {
    oauth.mockResolvedValue({ data: { url: "https://proj.supabase.co/x" }, error: null });
    let blocked = 0;
    for (let i = 0; i < 40; i++) if ((await GET(req("", "198.51.100.99"))).headers.get("location")?.includes("error=google")) blocked++;
    expect(blocked).toBeGreaterThan(0);
  });
});
