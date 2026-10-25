import { Hero } from "@/components/sections/Hero";
import { PhoneShowcaseSection } from "@/components/sections/PhoneShowcaseSection";
import { BrandVoiceSection } from "@/components/sections/BrandVoiceSection";
import { FaqSection } from "@/components/sections/FaqSection";
import { ClosingCtaSection } from "@/components/sections/ClosingCtaSection";

/**
 * Home — segunda revisão (2026-10-20, pós-referências visuais). A primeira
 * reformulação (mesmo dia) ainda produzia 5 blocos de cor sólida
 * empilhados, incluindo um grid de cards de kit ("FeaturedKitsSection")
 * que a Ana rejeitou por parecer vitrine de e-commerce. Agora: 4 seções,
 * fundo creme contínuo (sem retângulos de cor cobrindo a tela inteira —
 * só o card escuro contido de `BrandVoiceSection`), nenhum card/grid/
 * listagem de kit em lugar nenhum da home. A única função comercial de
 * qualquer CTA aqui é levar pro catálogo `/kits` — a listagem de kits em
 * si vive só lá.
 */
export default function Home() {
  return (
    <main>
      <Hero />
      <PhoneShowcaseSection />
      <BrandVoiceSection />
      <FaqSection />
      <ClosingCtaSection />
    </main>
  );
}
