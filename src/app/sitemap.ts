import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/lib/seo/site";

/** Public pages only. Private routes (/parent, /tester, /api) never appear here. */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries();
}
