import type { Kit } from "@/types/kit";
import { getAllTemplates } from "@/lib/templates";

/**
 * Dados mockados — trocar por consulta ao Supabase (`kits`, ver
 * docs/mosaico-context.md seção 4/5) quando o schema estiver conectado.
 * Mesma assinatura (getAllKits/getKitBySlug) de propósito, como em
 * src/lib/templates.ts.
 *
 * Nichos: os 4 originais vêm do documento de contexto (seção 1); os
 * seguintes foram pedidos diretamente pela Ana em 2026-09-15 (incluindo
 * "aesthetic" = influencers — não sinônimo de "Estética", que existiu
 * como kit próprio até ser removido a pedido da Ana em 2026-09-21, sem
 * nunca ter tido templates reais). "Psicologia" adicionado a pedido da
 * Ana em 2026-10-13. Kit Social Media, Kit Institucional Advocacia
 * (`advogados`) e Kit Consultoria Empresarial já têm templates reais
 * cadastrados — os demais seguem `status: "draft"` (sem efeito visual
 * hoje: o selo "Em breve" que usava esse campo foi removido do site em
 * 2026-10-13, ver src/app/kits/[slug]/page.tsx).
 */
const kits: Kit[] = [
  {
    id: "kit-social-media",
    slug: "social-media",
    title: "Social Media",
    // Posicionamento exclusivo deste kit — ver docs/mosaico-context.md,
    // seção 3.2. Não é "mais um pacote de templates pra Instagram": cobre
    // tanto o que o social media publica (Feed/Story/Carrossel) quanto o
    // que ele precisa pra trabalhar (apresentar estratégia, planejamento e
    // propostas ao cliente). Regra não se aplica aos outros kits.
    description:
      "Templates para criar seu conteúdo e ferramentas visuais para planejar, apresentar e organizar seu trabalho com o cliente.",
    status: "draft",
  },
  {
    id: "kit-advogados",
    slug: "advogados",
    // `title` atualizado de "Advogados" para "Institucional Advocacia" a
    // pedido explícito da Ana em 2026-09-21, junto do cadastro do primeiro
    // template real deste kit — mesmo kit (`slug: "advogados"` preservado,
    // nenhum kit novo criado, confirmado com ela antes de agir: era
    // reposicionamento do kit existente, não um kit paralelo). `id`/`slug`
    // mantidos intocados de propósito (mudar o slug quebraria a rota
    // `/kits/advogados` e o `kitSlug` de qualquer template futuro deste
    // nicho).
    title: "Institucional Advocacia",
    description:
      "Comunicação séria e editorial para escritórios e advogados autônomos.",
    status: "draft",
  },
  {
    id: "kit-personal-trainer",
    slug: "personal-trainer",
    title: "Personal Trainer",
    description:
      "Templates pensados pra quem vive de resultado e precisa mostrar isso todo dia.",
    status: "draft",
  },
  {
    id: "kit-consultoria-empresarial",
    slug: "consultoria-empresarial",
    title: "Consultoria Empresarial",
    description:
      "Comunicação estratégica para consultorias que vendem resultado e autoridade.",
    status: "draft",
  },
  {
    id: "kit-contabilidade",
    slug: "contabilidade",
    title: "Contabilidade",
    description:
      "Clareza e confiança para quem transforma números em decisões.",
    status: "draft",
  },
  {
    id: "kit-nutricao-esportiva",
    slug: "nutricao-esportiva",
    title: "Nutrição Esportiva",
    description:
      "Templates para quem une performance, ciência e resultado visível.",
    status: "draft",
  },
  {
    id: "kit-hof",
    slug: "hof",
    title: "HOF",
    description:
      "Sorriso e harmonização orofacial em destaque, com o cuidado que o procedimento pede.",
    status: "draft",
  },
  {
    id: "kit-biomedicina-estetica",
    slug: "biomedicina-estetica",
    title: "Biomedicina Estética",
    description: "Presença clínica e sofisticada para procedimentos estéticos.",
    status: "draft",
  },
  {
    id: "kit-maquiadoras",
    slug: "maquiadoras",
    title: "Maquiadoras",
    description:
      "Templates pensados para quem transforma rostos e precisa mostrar isso.",
    status: "draft",
  },
  {
    id: "kit-aesthetic",
    slug: "aesthetic",
    title: "Aesthetic",
    description:
      "Feed com estética própria para quem vive de criar conteúdo e influenciar.",
    status: "draft",
  },
  {
    id: "kit-psicologia",
    slug: "psicologia",
    title: "Psicologia",
    description:
      "Comunicação acolhedora e confiável para psicólogos e consultórios de psicologia.",
    status: "draft",
  },
];

export function getAllKits(): Kit[] {
  return kits;
}

export function getKitBySlug(slug: string): Kit | undefined {
  return kits.find((kit) => kit.slug === slug);
}

/**
 * Kits com pelo menos um template real cadastrado (`kitSlug` apontando pra
 * ele) — distinto de `status`, que hoje não tem efeito nenhum (ver nota no
 * topo do arquivo). Usado onde a home/catálogo precisam diferenciar "tem
 * conteúdo de verdade" de "kit só planejado, ainda sem peças" (pedido da
 * Ana em 2026-10-20: nunca destacar ou apresentar como produto disponível
 * um kit vazio). Reaproveitado por `FeaturedKitsSection`, `KitCatalogCard`
 * e `WhatsInsideSection` — nenhum duplica esta checagem.
 */
export function kitHasRealContent(kitSlug: string): boolean {
  return getAllTemplates().some((template) => template.kitSlug === kitSlug);
}

export function getKitsWithRealContent(): Kit[] {
  return kits.filter((kit) => kitHasRealContent(kit.slug));
}
