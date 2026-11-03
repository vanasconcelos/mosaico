import Link from "next/link";
import type { Kit } from "@/types/kit";
import { TemplatePreview } from "@/components/templates/TemplatePreview";
import { CrossfadeImage } from "@/components/ui/CrossfadeImage";
import { getAllTemplates } from "@/lib/templates";
import { kitHasRealContent } from "@/lib/kits";
import { resolveSafeCoverUrl } from "@/lib/safe-covers";
import { formatMosaicoPrice } from "@/lib/pricing";
import { cx } from "@/lib/cx";

/**
 * Card do catálogo (`/kits`). Reescrito em 2026-10-20 (2ª passada): a
 * primeira versão era um card "de loja" clássico — imagem + caixa
 * retangular com borda ao redor do card inteiro, igual a qualquer grid
 * de e-commerce. A Ana apontou que o catálogo não tinha nada da
 * linguagem editorial do resto do site (cards continuam permitidos
 * aqui — a regra de "sem card" era só pra home). Agora: a capa flutua
 * com sombra própria e leve inclinação (mesma gramática visual do Hero/
 * PhoneShowcaseSection), sem caixa ao redor do card inteiro; texto solto
 * embaixo, não dentro de um retângulo.
 *
 * Capa = primeiro `previewImageUrl` real do kit (mesmo critério de
 * exclusão de "Apresentação"/"Conteúdo Jurídico" já usado em
 * `KitCard.buildRealShowcaseGroups` — peça de Feed/Carrossel, não de
 * documento A4). `undefined` quando o kit não tem nenhuma peça real.
 *
 * Kits sem conteúdo real NUNCA aparecem como produto disponível (pedido
 * explícito da Ana): sem capa real (placeholder decorativo já rotulado
 * de `TemplatePreview`, sem inclinação — não finge ser uma peça de
 * verdade), badge "Em preparação" em vez de "Ver kit", e o link leva pra
 * página do kit, que já mostra honestamente "Em preparação — ainda sem
 * peças publicadas." em vez de fingir um CTA de compra.
 *
 * Capa com crossfade (2026-10-20, 3ª passada): a Ana pediu que o card do
 * kit usasse "a mesma técnica do celular" — `CrossfadeImage` entre várias
 * peças reais desse kit, não mais uma imagem estática só. Até 4 peças
 * (mesmo critério de exclusão de sempre).
 */
function getKitCoverImages(kit: Kit): string[] {
  return getAllTemplates()
    .filter(
      (template) =>
        template.kitSlug === kit.slug &&
        template.previewImageUrl &&
        template.category !== "Apresentação" &&
        template.category !== "Conteúdo Jurídico",
    )
    .slice(0, 4)
    .map((template) => resolveSafeCoverUrl(template.slug))
    .filter((url): url is string => Boolean(url));
}

interface KitCatalogCardProps {
  kit: Kit;
  /** Inclinação alternada por posição no grid (ver /kits/page.tsx) —
   * mesma ideia das peças reais do Hero/PhoneShowcaseSection, nunca
   * aplicada no placeholder decorativo de kit vazio. */
  tilt?: -1 | 1;
  /** `priority` do `next/image` (Fase 4.4) — só o primeiro card do grid
   * (acima da dobra em `/kits`) deveria usar; os demais seguem lazy por
   * padrão. Default `false` de propósito — ver /kits/page.tsx. */
  priority?: boolean;
}

export function KitCatalogCard({ kit, tilt = -1, priority = false }: KitCatalogCardProps) {
  const hasContent = kitHasRealContent(kit.slug);
  const covers = hasContent ? getKitCoverImages(kit) : [];

  return (
    <Link href={`/kits/${kit.slug}`} className="group flex flex-col">
      <div
        className={cx(
          "relative w-full",
          hasContent && (tilt === -1 ? "-rotate-1" : "rotate-1"),
        )}
      >
        {hasContent ? (
          <CrossfadeImage
            images={covers}
            alt={`Peças reais do Kit ${kit.title}`}
            intervalMs={3800}
            priority={priority}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="aspect-[4/5] w-full overflow-hidden rounded-[3px] border border-mosaico-border/40 shadow-[0_28px_56px_-24px_rgba(23,19,15,0.4)] transition-shadow group-hover:shadow-[0_32px_64px_-20px_rgba(23,19,15,0.5)]"
          />
        ) : (
          <TemplatePreview
            template={{
              id: `${kit.id}-catalog-cover`,
              slug: null,
              title: kit.title,
              category: null,
              previewImageUrl: null,
            }}
            placeholderStyle="decorative"
            className="aspect-[4/5] w-full overflow-hidden rounded-[3px] border-2 border-dashed border-mosaico-border/40"
          />
        )}
        {!hasContent && (
          <span className="absolute top-3 left-3 rounded-full bg-mosaico-ink/85 px-3 py-1 font-sans text-[11px] font-semibold tracking-[0.1em] text-mosaico-bg uppercase">
            Em preparação
          </span>
        )}
      </div>

      <div className="mt-6 text-center">
        <h3 className="font-serif text-xl text-mosaico-ink">Kit {kit.title}</h3>
        <p className="mx-auto mt-2 max-w-xs font-sans text-sm text-mosaico-ink-soft">
          {kit.description}
        </p>
        {hasContent && (
          <p className="mt-2 font-sans text-xs text-mosaico-ink-soft">
            {formatMosaicoPrice()} — acesso completo, pagamento único
          </p>
        )}
        <span
          className={cx(
            "mt-4 inline-flex items-center gap-2 font-sans text-sm font-semibold",
            hasContent
              ? "text-mosaico-accent-deep group-hover:text-mosaico-ink"
              : "text-mosaico-ink-soft",
          )}
        >
          {hasContent ? "Ver kit" : "Em preparação"}
          {hasContent && <span aria-hidden>→</span>}
        </span>
      </div>
    </Link>
  );
}
