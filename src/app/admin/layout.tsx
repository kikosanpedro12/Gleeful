import type { Metadata } from "next";

/** Founder-only. Never indexed (also X-Robots-Tag in next.config.mjs and Disallow in robots.txt). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
