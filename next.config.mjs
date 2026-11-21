/**
 * Security headers for every response (CSP is per-request, in src/proxy.ts).
 * Microphone: this site only. Camera, location, payments etc.: nobody.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), display-capture=(), browsing-topics=()",
  },
  // Only honoured over HTTPS; harmless on localhost.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/**
 * Private routes are never indexed, even if a crawler ignores robots.txt.
 * Keep in sync with PRIVATE_PREFIXES in src/lib/seo/site.ts (tests/seo.test.ts checks it).
 * While SITE_INDEXING is not "on", every route is noindex.
 */
export const PRIVATE_ROUTE_SOURCES = ["/api/:path*", "/auth/:path*", "/faq/:path*", "/learn/:path*", "/parent/:path*", "/pricing/:path*", "/sign-in/:path*", "/tester/:path*", "/voice-lab/:path*"];
const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }];

/**
 * The teacher models (public/assets/characters) are ~2.5 MB and not content-hashed: cache an hour, no stale-while-revalidate.
 * A stale-while-revalidate window would let a returning visitor mix an old character file with a new clips.glb for days after
 * `npm run build:characters`. Replacing a model in place reaches returning visitors within an hour (or rename the file / bump the URL
 * in glbRig.ts to ship it at once). Nothing else is cached here, and the CSP (src/proxy.ts) is untouched.
 */
export const CHARACTER_CACHE = { key: "Cache-Control", value: "public, max-age=3600" };

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/assets/characters/:path*", headers: [CHARACTER_CACHE] },
      ...PRIVATE_ROUTE_SOURCES.map((source) => ({ source, headers: noindex })),
      ...(process.env.SITE_INDEXING === "on" ? [] : [{ source: "/:path*", headers: noindex }]),
    ];
  },
};
export default nextConfig;
