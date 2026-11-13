import type { Metadata } from "next";
import "@fontsource-variable/unbounded/wght.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@/components/landing/landing.css";

// The landing page is the only part of the site that may be indexed, and only
// when SITE_INDEXING=on (robots come from the root layout and src/lib/seo/site.ts).
// The lesson app (/learn), the parent view and every API route stay noindex.
export const metadata: Metadata = {
  title: { absolute: "Gleeful: a talking AI tutor for kids, in 3D worlds (early access)" },
  description: "Gleeful is an AI tutor for kids from kindergarten to grade 12. Your child asks out loud and the tutor shows them in 3D worlds, from under the sea to out past the Moon. Early access: the demo lesson is scripted; the live AI tutor is in private testing.",
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
