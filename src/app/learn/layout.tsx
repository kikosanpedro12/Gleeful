import type { Metadata } from "next";
import "@fontsource-variable/unbounded/wght.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";

// The lesson itself is an app, not a page for search engines.
export const metadata: Metadata = {
  title: "Lesson",
  description: "Gleeful demo lesson.",
  robots: { index: false, follow: false },
};

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return children;
}
