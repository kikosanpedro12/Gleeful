import type { Metadata } from "next";

/** The parent view shows a family's learning history: never indexed (also X-Robots-Tag in next.config.mjs). */
export const metadata: Metadata = { title: "Parent view · Gleeful", robots: { index: false, follow: false, nocache: true } };

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
