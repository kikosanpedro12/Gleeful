import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Voice lab",
  description: "Private voice comparison.",
  robots: { index: false, follow: false },
};

export default function VoiceLabLayout({ children }: { children: React.ReactNode }) {
  return children;
}
