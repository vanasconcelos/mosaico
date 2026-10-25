import type { CSSProperties } from "react";
import type { TemplateAspectRatio, TemplateSummary } from "@/types/template";
import { resolveSafeCoverUrl } from "@/lib/safe-covers";
import { cx } from "@/lib/cx";

/** Tons de placeholder com contraste real (claro/escuro alternando), não só
 * variações de marrom — a cor de rótulo muda junto para continuar legível.
 * Só usados no modo "decorative" (grades densas onde a peça em si não
 * importa individualmente, ex.: showcase do Hero). */
const DECORATIVE_TONES = [
  { bg: "bg-mosaico-ink", label: "text-mosaico-bg/70" },
  { bg: "bg-mosaico-accent", label: "text-mosaico-ink/70" },
  { bg: "bg-mosaico-bg border border-mosaico-border/50", label: "text-mosaico-ink-soft" },
  { bg: "bg-mosaico-accent-deep", label: "text-mosaico-bg/70" },
  { bg: "bg-mosaico-border", label: "text-mosaico-bg/70" },
  { bg: "bg-mosaico-bg border border-mosaico-border/50", label: "text-mosaico-ink-soft" },
] as const;

interface TemplatePreviewProps {
  template: TemplateSummary;
  /**
   * "decorative" (padrão): bloco de cor da paleta variando por índice — só
   * pra dar volume visual numa grade densa onde nenhuma peça é olhada
   * individualmente (o showcase do Hero). "pending": placeholder neutro e
   * explicitamente rotulado como preview pendente — usar sempre que o
   * template é um produto real (TemplateCard, TemplateDetail) e ainda não
   * tem `previewImageUrl`, pra nunca parecer um design finalizado.
   */
  placeholderStyle?: "decorative" | "pending";
  /** Só usado no modo "decorative", pra variar o tom do placeholder — sem
   * efeito quando a imagem real existe ou no modo "pending". */
  index?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Apresentação visual de um template — único ponto que sabe ler
 * `previewImageUrl` e `aspectRatio`. Quando a imagem real existir, mostra
 * ela (object-cover, proporção do próprio template); sem ela, mostra um
 * placeholder — nunca inventa ou recria o design.
 *
 * Único ponto também responsável por nunca expor o arquivo completo de
 * um template pago como capa pública (B4.1, 2026-10-24): sempre resolve
 * `previewImageUrl` por `resolveSafeCoverUrl` antes de renderizar — troca
 * silenciosamente para a miniatura reduzida dedicada quando o slug está
 * na lista de capas inadequadas (`src/lib/safe-covers.ts`), sem exigir
 * que cada chamador (TemplateCard, Hero, BrandVoiceSection, etc.) saiba
 * disso. Centralizar aqui evita qualquer lugar "esquecer" a checagem.
 */
export function TemplatePreview({
  template,
  placeholderStyle = "decorative",
  index = 0,
  className,
  style,
}: TemplatePreviewProps) {
  const { title, category, slug, aspectRatio } = template;
  const previewImageUrl = resolveSafeCoverUrl(slug);
  const tone = DECORATIVE_TONES[index % DECORATIVE_TONES.length];

  return (
    <div
      style={{ aspectRatio: resolveAspectRatio(aspectRatio), ...style }}
      className={cx(
        "relative w-full overflow-hidden",
        !previewImageUrl &&
          (placeholderStyle === "decorative"
            ? tone.bg
            : "border-2 border-dashed border-mosaico-border/40 bg-mosaico-bg"),
        className,
      )}
    >
      {previewImageUrl ? (
        // Miniaturas densas e numerosas (grid do Hero, coleções) — plain
        // <img> em vez de next/image evita configurar remotePatterns antes
        // de sabermos de onde os previews reais vão vir (Supabase Storage).
        // Revisar para next/image quando isso estiver definido.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewImageUrl}
          alt={title}
          className="h-full w-full object-cover"
        />
      ) : placeholderStyle === "decorative" ? (
        <span
          className={cx(
            "absolute bottom-1.5 left-1.5 font-sans text-[8px] font-semibold tracking-[0.15em] uppercase",
            tone.label,
          )}
        >
          {category}
        </span>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
          <span className="font-sans text-[11px] font-semibold tracking-[0.15em] text-mosaico-ink-soft uppercase">
            Preview pendente
          </span>
          <span className="font-sans text-xs text-mosaico-ink-soft/70">
            Aguardando PNG exportado do Canva
          </span>
        </div>
      )}
    </div>
  );
}

function resolveAspectRatio(aspectRatio?: TemplateAspectRatio): string {
  return aspectRatio ?? "4/5";
}
