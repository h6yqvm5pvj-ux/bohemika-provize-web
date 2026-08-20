import type { MetadataRoute } from "next";

import { listEnabledOnlineCardSlugs } from "@/lib/server/onlineCard";

const PUBLIC_APP_ORIGIN = "https://bohemka.app";

export const revalidate = 3_600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await listEnabledOnlineCardSlugs();

  return [
    {
      url: `${PUBLIC_APP_ORIGIN}/jakubrauscher`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...slugs.map((slug) => ({
      url: `${PUBLIC_APP_ORIGIN}/vizitka/${slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
