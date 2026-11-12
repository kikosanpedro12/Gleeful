import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = { title: "Gleeful — prototype", description: "Private family prototype. Leo and Mia are AI teachers.", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, themeColor: "#f3e7d3" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render per request so every page gets the per-request CSP nonce (src/proxy.ts).
  await connection();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
