import type { MetadataRoute } from "next";
import { getKitsWithRealContent, getAllTemplates } from "@/lib/catalog";

// Fase 2 — integração do catálogo real: lê via src/lib/catalog.ts (banco
// Supabase, com fallback automático e seguro para os dados estáticos
// enquanto o banco remoto não estiver populado — ver comentário daquele
// módulo). `sitemap()` async é suportado nativamente pelo Next.js.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/kits`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/sobre`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/politica-de-privacidade`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/termos-de-uso`, changeFrequency: "yearly", priority: 0.3 },
  ];

  // Só kits com conteúdo real — os 5 ainda vazios não têm página pública
  // própria para indexar.
  const kitsComConteudo = await getKitsWithRealContent();
  const kitRoutes: MetadataRoute.Sitemap = kitsComConteudo.map((kit) => ({
    url: `${baseUrl}/kits/${kit.slug}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const templates = await getAllTemplates();

  const templateRoutes: MetadataRoute.Sitemap = templates.map((template) => ({
    url: `${baseUrl}/templates/${template.slug}`,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  // Mesmo filtro usado por cada página (ver src/app/kits/[slug]/apresentacoes
  // e .../conteudo-juridico) — só entra no sitemap o kit que de fato tem
  // pelo menos um template dessa categoria, nunca uma rota que daria 404.
  const kitSlugsComApresentacoes = new Set(
    templates
      .filter((template) => template.category === "Apresentação" && template.kitSlug)
      .map((template) => template.kitSlug as string),
  );
  const kitSlugsComConteudoJuridico = new Set(
    templates
      .filter((template) => template.category === "Conteúdo Jurídico" && template.kitSlug)
      .map((template) => template.kitSlug as string),
  );

  const apresentacoesRoutes: MetadataRoute.Sitemap = [...kitSlugsComApresentacoes].map(
    (kitSlug) => ({
      url: `${baseUrl}/kits/${kitSlug}/apresentacoes`,
      changeFrequency: "monthly",
      priority: 0.5,
    }),
  );
  const conteudoJuridicoRoutes: MetadataRoute.Sitemap = [...kitSlugsComConteudoJuridico].map(
    (kitSlug) => ({
      url: `${baseUrl}/kits/${kitSlug}/conteudo-juridico`,
      changeFrequency: "monthly",
      priority: 0.5,
    }),
  );

  return [
    ...staticRoutes,
    ...kitRoutes,
    ...apresentacoesRoutes,
    ...conteudoJuridicoRoutes,
    ...templateRoutes,
  ];
}
