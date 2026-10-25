import Link from "next/link";
import type { Kit } from "@/types/kit";
import type { TemplateCategory, TemplateSummary } from "@/types/template";
import { TemplatePreview } from "@/components/templates/TemplatePreview";
import { KitShowcaseCell } from "@/components/kits/KitShowcaseCell";
import { getAllTemplates } from "@/lib/templates";
import { resolveSafeCoverUrl } from "@/lib/safe-covers";
import { cx } from "@/lib/cx";

const SHOWCASE_CATEGORIES: TemplateCategory[] = [
  "Feed",
  "Story",
  "Carrossel",
  "Feed",
  "Story",
  "Feed",
];

const SHOWCASE_CELL_COUNT = SHOWCASE_CATEGORIES.length;
const MAX_IMAGES_PER_CELL = 3;

/**
 * Textura visual decorativa (mesma convenção do showcase do Hero — ver
 * TemplatePreview) pra dar presença ao kit enquanto ele não tem templates
 * reais atribuídos. Não representa peças reais desse kit específico.
 */
function buildShowcase(kit: Kit): TemplateSummary[] {
  return SHOWCASE_CATEGORIES.map((category, i) => ({
    id: `${kit.id}-showcase-${i}`,
    slug: null,
    title: `${kit.title} ${i + 1}`,
    category,
    previewImageUrl: null,
  }));
}

/**
 * Vitrine com peças REAIS do kit (pedido da Ana em 2026-09-20): distribui
 * os `previewImageUrl` já cadastrados (nunca gera nada novo) em
 * `SHOWCASE_CELL_COUNT` grupos, round-robin, até `MAX_IMAGES_PER_CELL`
 * cada — cada grupo vira uma célula que alterna entre suas imagens (ver
 * KitShowcaseCell). Exclui explicitamente `category: "Apresentação"`
 * ("Apresentação para Clientes" não é uma peça de Feed/Story/Carrossel,
 * não deve aparecer nessa vitrine) e, pelo mesmo motivo (peça de
 * documento A4, não de Feed/Story/Carrossel), `category: "Conteúdo
 * Jurídico"` (pedido da Ana em 2026-10-03, junto da pasta de Conteúdo
 * Jurídico — ver src/app/kits/[slug]/page.tsx) — e qualquer template
 * sem `previewImageUrl` ainda. `null` quando o kit não tem nenhuma peça
 * real — nesse caso o caller mantém o placeholder decorativo de sempre.
 */
function buildRealShowcaseGroups(kit: Kit): string[][] | null {
  const pieces = getAllTemplates()
    .filter(
      (template) =>
        template.kitSlug === kit.slug &&
        template.category !== "Apresentação" &&
        template.category !== "Conteúdo Jurídico",
    )
    // Nunca o arquivo completo original — mesma resolução segura usada
    // em TemplatePreview, aplicada aqui porque a vitrine monta arrays de
    // URL diretamente (não passa por TemplatePreview para cada peça).
    .map((template) => resolveSafeCoverUrl(template.slug))
    .filter((url): url is string => Boolean(url));

  if (pieces.length === 0) return null;

  const groups: string[][] = Array.from({ length: SHOWCASE_CELL_COUNT }, () => []);
  pieces.forEach((url, i) => {
    const cell = i % SHOWCASE_CELL_COUNT;
    if (groups[cell].length < MAX_IMAGES_PER_CELL) {
      groups[cell].push(url);
    }
  });

  return groups;
}

interface KitCardProps {
  kit: Kit;
  /** Alterna o lado do preview (esquerda/direita) para dar ritmo editorial
   * quando vários kits aparecem em sequência. */
  reverse?: boolean;
  className?: string;
}

/**
 * Apresenta um kit como experiência visual — não um card pequeno com nome
 * e cor. Selo "Em breve" removido a pedido da Ana (2026-09-20): `status`
 * continua existindo em `Kit` (nada da estrutura/lógica de kit mudou),
 * só o indicador visual saiu daqui — decisão só de copy/apresentação.
 */
export function KitCard({ kit, reverse = false, className }: KitCardProps) {
  const realShowcaseGroups = buildRealShowcaseGroups(kit);
  const decorativeShowcase = realShowcaseGroups ? null : buildShowcase(kit);

  return (
    <div
      className={cx(
        "grid items-center gap-10 lg:grid-cols-2 lg:gap-16",
        className,
      )}
    >
      <div
        className={cx(
          "grid grid-cols-3 gap-[3px] overflow-hidden rounded-[3px] border border-mosaico-border/40",
          reverse && "lg:order-2",
        )}
      >
        {realShowcaseGroups
          ? realShowcaseGroups.map((images, i) => (
              <KitShowcaseCell
                key={`${kit.id}-real-${i}`}
                images={images}
                alt={`Peça do Kit ${kit.title}`}
                intervalMs={4000 + i * 550}
              />
            ))
          : decorativeShowcase!.map((template, i) => (
              <TemplatePreview key={template.id} template={template} index={i} />
            ))}
      </div>

      <div
        className={cx(
          "text-center lg:text-left",
          reverse && "lg:order-1",
        )}
      >
        <h3 className="font-serif text-3xl text-mosaico-ink sm:text-4xl">
          Kit {kit.title}
        </h3>
        <p className="mx-auto mt-3 max-w-sm font-sans text-base text-mosaico-ink-soft lg:mx-0">
          {kit.description}
        </p>
        <Link
          href={`/kits/${kit.slug}`}
          className="mt-6 inline-flex items-center gap-2 font-sans text-sm font-semibold text-mosaico-accent-deep underline decoration-mosaico-border decoration-1 underline-offset-4 hover:text-mosaico-ink"
        >
          Conhecer o kit
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
