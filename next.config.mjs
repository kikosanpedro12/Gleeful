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
export const PRIVATE_ROUTE_SOURCES = ["/api/:path*", "/auth/:path*", "/learn/:path*", "/parent/:path*", "/sign-in/:path*", "/tester/:path*"];
const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...PRIVATE_ROUTE_SOURCES.map((source) => ({ source, headers: noindex })),
      ...(process.env.SITE_INDEXING === "on" ? [] : [{ source: "/:path*", headers: noindex }]),
    ];
  },
};
export default nextConfig;
