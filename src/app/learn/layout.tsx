import type { Metadata } from "next";

// The lesson itself is an app, not a page for search engines.
export const metadata: Metadata = {
  title: "Lesson",
  description: "Gleeful demo lesson.",
  robots: { index: false, follow: false },
};

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return children;
}
