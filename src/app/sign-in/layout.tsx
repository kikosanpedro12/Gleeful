import type { Metadata } from "next";
import { PublicAnalytics } from "@/components/PublicAnalytics";

/** Sign-in is for parents only and is never indexed (also X-Robots-Tag in next.config.mjs). */
export const metadata: Metadata = { title: "Parent sign-in · Gleeful", robots: { index: false, follow: false, nocache: true } };

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<PublicAnalytics /></>;
}
