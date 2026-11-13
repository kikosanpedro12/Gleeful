/**
 * Discoverability policy for search engines and AI crawlers.
 *
 * Gleeful is a children's product, so the rule is: only the public landing page (/)
 * and the privacy notice (/privacy) may be indexed. Anything a family or child uses after
 * that (/learn, /parent, /sign-in, /auth, /tester, /api) is disallowed in robots.txt AND sent with
 * `X-Robots-Tag: noindex` (next.config.mjs), because robots.txt alone is a
 * request, not a control. No child data or session id ever appears in a URL.
 *
 * Indexing is OFF unless the server env `SITE_INDEXING=on` is set at build
 * time. While off, robots.txt disallows everything and every page is noindex.
 * Turn it on when Kiko is ready for the landing page to be found (it is
 * built); the lesson app stays noindex either way.
 */
export const SITE_URL = normaliseSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

export function normaliseSiteUrl(raw: string | undefined): string {
  const fallback = "https://gleeful-six.vercel.app";
  if (!raw) return fallback;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return fallback;
    return u.origin;
  } catch {
    return fallback;
  }
}

export function indexingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SITE_INDEXING === "on";
}

/** Paths that may appear in the sitemap and be indexed (when indexing is on). */
export const PUBLIC_PATHS: readonly string[] = ["/", "/privacy"];

/** Never indexed, always disallowed. Keep in sync with next.config.mjs (tested). */
/** /learn is the lesson app itself (a child uses it); it is not a page for search engines. */
export const PRIVATE_PREFIXES: readonly string[] = ["/api", "/auth", "/learn", "/parent", "/sign-in", "/tester"];

export function isPrivatePath(pathname: string): boolean {
  const p = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  return PRIVATE_PREFIXES.some((pre) => p === pre || p.startsWith(pre + "/"));
}

/** Crawlers we explicitly welcome on public pages (search and AI answer engines). */
export const WELCOMED_BOTS: readonly string[] = [
  "Googlebot",
  "Bingbot",
  "GPTBot",
  "OAI-SearchBot",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
];

export type RobotsRule = { userAgent: string | string[]; allow?: string | string[]; disallow?: string | string[] };
export type RobotsConfig = { rules: RobotsRule[]; sitemap?: string; host?: string };

export function robotsConfig(indexing: boolean, siteUrl: string = SITE_URL): RobotsConfig {
  if (!indexing) return { rules: [{ userAgent: "*", disallow: "/" }] };
  const disallow = PRIVATE_PREFIXES.flatMap((p) => [p, p + "/"]);
  return {
    rules: [
      { userAgent: [...WELCOMED_BOTS], allow: [...PUBLIC_PATHS, "/llms.txt"], disallow },
      { userAgent: "*", allow: [...PUBLIC_PATHS, "/llms.txt"], disallow },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}

export function sitemapEntries(siteUrl: string = SITE_URL, now: Date = new Date()) {
  return PUBLIC_PATHS.filter((p) => !isPrivatePath(p)).map((p) => ({
    url: `${siteUrl}${p === "/" ? "" : p}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: p === "/" ? 1 : 0.5,
  }));
}

export const SITE_NAME = "Gleeful";
export const SITE_TITLE = "Gleeful: a talking AI teacher for kids, in 3D worlds (early access)";
export const SITE_DESCRIPTION =
  "Gleeful is a talking teacher for kids from kindergarten to grade 12: your child asks out loud, and the teacher takes them into interactive 3D worlds to see the answer. Early access: the demo lesson is scripted; the live AI teacher is in private testing.";

/** schema.org JSON-LD. Static facts only: no ratings, prices we do not charge yet, or features we have not shipped. */
export function jsonLd(siteUrl: string = SITE_URL) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${siteUrl}/#org`, name: SITE_NAME, url: siteUrl },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#app`,
        name: SITE_NAME,
        url: siteUrl,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web browser",
        description: SITE_DESCRIPTION,
        audience: { "@type": "EducationalAudience", educationalRole: "student", audienceType: "Children from kindergarten to grade 12, with a parent" },
        publisher: { "@id": `${siteUrl}/#org` },
        releaseNotes: "Early access. A scripted demo lesson is public; the live AI teacher is in private testing.",
      },
    ],
  };
}

/** Serialise for a <script type="application/ld+json"> data block: `<` is escaped so no tag can close early. */
export function serialiseJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
