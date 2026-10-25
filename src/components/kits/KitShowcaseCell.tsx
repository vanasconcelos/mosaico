import { CrossfadeImage } from "@/components/ui/CrossfadeImage";
import { cx } from "@/lib/cx";

interface KitShowcaseCellProps {
  /** `previewImageUrl`s reais já cadastrados (nunca gerado aqui) — 1 item
   * fica estático, 2+ alternam em crossfade contínuo. */
  images: string[];
  alt: string;
  /** Varia por célula (ver KitCard) pra elas saírem de sincronia com o
   * tempo, em vez de trocar todas juntas — leitura mais orgânica. */
  intervalMs?: number;
  className?: string;
}

/**
 * Uma célula da vitrine do kit com peças reais: alterna entre os previews
 * já cadastrados desse kit com fade suave. Só entra em cena quando o kit
 * tem `previewImageUrl` reais (ver `buildRealShowcaseGroups` em KitCard) —
 * nunca substitui o placeholder decorativo dos kits ainda sem templates.
 *
 * Wrapper fino de `CrossfadeImage` (2026-10-20) — só fixa a proporção
 * `aspect-[4/5]` usada na grade do KitCard; o crossfade em si (estado,
 * `prefers-reduced-motion`) mora no componente genérico.
 */
export function KitShowcaseCell({
  images,
  alt,
  intervalMs = 4000,
  className,
}: KitShowcaseCellProps) {
  return (
    <CrossfadeImage
      images={images}
      alt={alt}
      intervalMs={intervalMs}
      className={cx("aspect-[4/5] w-full", className)}
    />
  );
}
