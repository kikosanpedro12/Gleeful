import type { MetadataRoute } from "next";
import { indexingEnabled, robotsConfig } from "@/lib/seo/site";

/** robots.txt. Policy lives in src/lib/seo/site.ts (tested). */
export default function robots(): MetadataRoute.Robots {
  return robotsConfig(indexingEnabled());
}
