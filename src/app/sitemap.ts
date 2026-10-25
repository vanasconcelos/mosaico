import type { MetadataRoute } from "next";
import { getKitsWithRealContent } from "@/lib/kits";
import { getAllTemplates } from "@/lib/templates";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/kits`, changeFrequency: "weekly", priority: 0.9 },
  ];

  // Só kits com conteúdo real — os 5 ainda vazios não têm página pública
  // própria para indexar.
  const kitRoutes: MetadataRoute.Sitemap = getKitsWithRealContent().map((kit) => ({
    url: `${baseUrl}/kits/${kit.slug}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const templateRoutes: MetadataRoute.Sitemap = getAllTemplates().map((template) => ({
    url: `${baseUrl}/templates/${template.slug}`,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...kitRoutes, ...templateRoutes];
}
