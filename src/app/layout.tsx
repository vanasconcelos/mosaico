import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
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
      className={`${fraunces.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-mosaico-bg text-mosaico-ink">
        {children}
      </body>
    </html>
  );
}
