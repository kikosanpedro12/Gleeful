import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "AI Teacher — prototype", description: "Private family prototype. Leo is an AI teacher.", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, themeColor: "#f3e7d3" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
