import type { Metadata } from "next";
import { Fraunces, Karla } from "next/font/google";
import { SiteHeader } from "@/components/layout/SiteHeader";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

/**
 * Troca de Inter por Karla (Fase de refinamento tipográfico) — Inter é a
 * face "segura" mais associada a sites genéricos/gerados por IA; Karla
 * tem desenho humanista, ligeiramente irregular (traços de origem
 * manuscrita), lê bem em telas pequenas e combina com o caráter
 * editorial do Fraunces sem competir com ele. Só troca o que preenche
 * `--font-sans` (globals.css) — nenhuma classe utilitária (`font-sans`)
 * já usada nos componentes precisou mudar.
 */
const karla = Karla({
  variable: "--font-karla",
  subsets: ["latin"],
});

/**
 * Base para resolver URLs relativas em metadados (ex.: imagens de Open
 * Graph) — mesmo fallback (`NEXT_PUBLIC_SITE_URL` ausente → localhost) já
 * usado em sitemap.ts/robots.ts/actions.ts, nunca um domínio novo
 * inventado aqui. Sem confirmação de domínio de produção no projeto (ver
 * Fase 4.3), fica em localhost até essa variável ser configurada.
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Mosaico — Templates editáveis no Canva por nicho profissional",
    template: "%s — Mosaico",
  },
  description:
    "Templates editáveis no Canva, organizados por kits de nicho profissional — social media, advogados, personal trainer, nutrição esportiva, consultoria empresarial e contabilidade.",
  openGraph: {
    title: "Mosaico — Templates editáveis no Canva por nicho profissional",
    description:
      "Templates editáveis no Canva, organizados por kits de nicho profissional.",
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Mosaico — Templates editáveis no Canva por nicho profissional",
    description:
      "Templates editáveis no Canva, organizados por kits de nicho profissional.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${fraunces.variable} ${karla.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-mosaico-bg text-mosaico-ink">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
