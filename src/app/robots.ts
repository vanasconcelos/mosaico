import type { MetadataRoute } from "next";

/**
 * Páginas de autenticação/conta (`/login`, `/cadastro`, `/conta`,
 * `/recuperar-senha`, `/atualizar-senha`) não ficam em `disallow` aqui —
 * de propósito (Fase 4.3, item 3): bloquear no robots.ts impediria o
 * Googlebot de sequer rastrear essas páginas e ler a diretiva `noindex`
 * que cada uma já declara no próprio `metadata.robots` (ver cada
 * page.tsx). Bloquear E marcar noindex ao mesmo tempo é a combinação que
 * a própria documentação do Google desaconselha — a diretiva no HTML
 * nunca chega a ser lida.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
