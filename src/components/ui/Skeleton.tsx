import type { CSSProperties } from "react";
import { cx } from "@/lib/cx";

/**
 * Bloco de esqueleto genérico — reaproveitado pelos `loading.tsx` de
 * `/kits/[slug]` e `/templates/[slug]` (Fase 4.5) pra montar cada layout
 * específico sem repetir a mesma classe de pulso em cada bloco. Tom
 * neutro já existente na paleta (`mosaico-border` em baixa opacidade,
 * nunca uma cor nova) — pulso sutil via `animate-pulse` (utilitário
 * nativo do Tailwind, nenhuma dependência nova), desligado quando a
 * pessoa pede menos movimento (`motion-reduce:animate-none`).
 *
 * `aria-hidden`: o bloco em si não carrega nenhuma informação (é só
 * forma); quem precisa saber que a página está carregando lê o texto
 * `role="status"` que cada `loading.tsx` já declara uma vez no topo —
 * repetir isso em cada bloco individual só adicionaria ruído pra quem
 * usa leitor de tela.
 */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  /** Pra proporções reais (ex.: `aspectRatio` de um template específico já
   * conhecido antes do Suspense) — mesmo padrão de `TemplateDetail.tsx`,
   * que já usa `style={{ aspectRatio }}` em vez de uma classe Tailwind
   * dinâmica (o compilador não geraria a classe certa em tempo de build
   * pra um valor só conhecido em runtime). */
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden
      style={style}
      className={cx(
        "animate-pulse rounded-[2px] bg-mosaico-border/15 motion-reduce:animate-none",
        className,
      )}
    />
  );
}
