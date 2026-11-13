import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { JsonLd } from "@/lib/seo/JsonLd";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL, indexingEnabled } from "@/lib/seo/site";
import "./globals.css";

const indexing = indexingEnabled();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  // Off until SITE_INDEXING=on (see src/lib/seo/site.ts). Private routes stay noindex either way.
  robots: indexing ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: { type: "website", siteName: SITE_NAME, title: SITE_TITLE, description: SITE_DESCRIPTION, url: "/", locale: "en_US" },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, themeColor: "#f3e7d3" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render per request so every page gets the per-request CSP nonce (src/proxy.ts).
  await connection();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en">
      <body>
        {children}
        <JsonLd nonce={nonce} />
      </body>
    </html>
  );
}
