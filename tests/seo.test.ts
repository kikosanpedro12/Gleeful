import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  PRIVATE_PREFIXES, PUBLIC_PATHS, WELCOMED_BOTS, indexingEnabled, isPrivatePath, jsonLd,
  normaliseSiteUrl, robotsConfig, serialiseJsonLd, sitemapEntries,
} from "@/lib/seo/site";
import nextConfig, { PRIVATE_ROUTE_SOURCES } from "../next.config.mjs";

const SITE = "https://gleeful.example";
type HeaderRule = { source: string; headers: { key: string; value: string }[] };

describe("indexing switch", () => {
  it("is off unless SITE_INDEXING is exactly 'on'", () => {
    expect(indexingEnabled({})).toBe(false);
    expect(indexingEnabled({ SITE_INDEXING: "true" })).toBe(false);
    expect(indexingEnabled({ SITE_INDEXING: "on" })).toBe(true);
  });
  it("robots.txt disallows everything while off", () => {
    const r = robotsConfig(false, SITE);
    expect(r.rules).toEqual([{ userAgent: "*", disallow: "/" }]);
    expect(r.sitemap).toBeUndefined();
  });
});

describe("robots.txt when indexing is on", () => {
  const r = robotsConfig(true, SITE);
  it("welcomes the named search and AI crawlers", () => {
    const bots = r.rules[0].userAgent as string[];
    for (const b of ["GPTBot", "ClaudeBot", "PerplexityBot", "OAI-SearchBot", "Google-Extended", "Googlebot", "Bingbot"]) expect(bots).toContain(b);
    expect(WELCOMED_BOTS).toEqual(bots);
  });
  it("every rule disallows every private prefix", () => {
    for (const rule of r.rules) for (const p of PRIVATE_PREFIXES) expect(rule.disallow).toContain(p);
  });
  it("points at the sitemap on our own origin", () => {
    expect(r.sitemap).toBe(`${SITE}/sitemap.xml`);
  });
});

describe("private paths", () => {
  it.each(["/api", "/api/brain", "/learn", "/learn/", "/parent", "/parent/", "/PARENT", "/tester", "/tester/x"])("%s is private", (p) => expect(isPrivatePath(p)).toBe(true));
  it.each(["/", "/parents-guide", "/apiary", "/testers", "/learners"])("%s is not private", (p) => expect(isPrivatePath(p)).toBe(false));
  it("the sitemap lists public pages only", () => {
    const urls = sitemapEntries(SITE).map((e) => e.url);
    expect(urls).toEqual([SITE, `${SITE}/privacy`]);
    for (const p of PUBLIC_PATHS) expect(isPrivatePath(p)).toBe(false);
  });
  it("next.config sends X-Robots-Tag noindex on every private prefix", async () => {
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    expect(PRIVATE_ROUTE_SOURCES.map((s) => s.replace("/:path*", ""))).toEqual([...PRIVATE_PREFIXES]);
    for (const src of PRIVATE_ROUTE_SOURCES) {
      const rule = rules.find((x) => x.source === src);
      expect(rule?.headers.find((h) => h.key === "X-Robots-Tag")?.value).toMatch(/noindex/);
    }
  });
});

describe("site URL", () => {
  it("falls back for missing, invalid or plain-http values", () => {
    expect(normaliseSiteUrl(undefined)).toBe("https://gleeful-six.vercel.app");
    expect(normaliseSiteUrl("not a url")).toBe("https://gleeful-six.vercel.app");
    expect(normaliseSiteUrl("http://evil.example")).toBe("https://gleeful-six.vercel.app");
    expect(normaliseSiteUrl("https://gleeful.ai/some/path?x=1")).toBe("https://gleeful.ai");
  });
});

describe("JSON-LD", () => {
  it("describes an EducationalApplication and an Organization", () => {
    const g = jsonLd(SITE)["@graph"] as Record<string, unknown>[];
    expect(g.find((n) => n["@type"] === "Organization")).toBeTruthy();
    expect(g.find((n) => n["@type"] === "SoftwareApplication")?.applicationCategory).toBe("EducationalApplication");
  });
  it("makes no claims we cannot back (no ratings, offers or free claim)", () => {
    const s = JSON.stringify(jsonLd(SITE));
    for (const k of ["aggregateRating", "review", "offers", "isAccessibleForFree"]) expect(s).not.toContain(k);
  });
  it("cannot break out of its script tag", () => {
    const out = serialiseJsonLd({ x: "</script><script>alert(1)</script>&" });
    expect(out).not.toMatch(/[<>&]/);
    expect(JSON.parse(out).x).toBe("</script><script>alert(1)</script>&");
  });
});

describe("llms.txt", () => {
  const txt = readFileSync("public/llms.txt", "utf8");
  it("states the honest status and the planned prices", () => {
    expect(txt).toMatch(/Early test version/);
    expect(txt).toMatch(/scripted, not live AI/);
    expect(txt).toMatch(/US\$29/);
    expect(txt).toMatch(/US\$79/);
    expect(txt).toMatch(/7-day free trial/);
  });
  it("tells crawlers the private routes are off limits", () => {
    for (const p of PRIVATE_PREFIXES) expect(txt).toContain(p);
  });
});

describe("page titles do not overclaim (the public demo is scripted)", () => {
  it("no title or description says the teacher is 'live' without saying it is private testing", async () => {
    const { SITE_TITLE, SITE_DESCRIPTION } = await import("@/lib/seo/site");
    const layout = readFileSync(new URL("../src/app/(marketing)/layout.tsx", import.meta.url), "utf8");
    for (const text of [SITE_TITLE, layout.match(/title: \{ absolute: "([^"]+)"/)?.[1] ?? ""]) {
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/\blive\b/i);
      expect(text).toMatch(/early access/i);
    }
    expect(SITE_DESCRIPTION).toMatch(/scripted/i);
    expect(layout).toMatch(/scripted/i);
  });
});
