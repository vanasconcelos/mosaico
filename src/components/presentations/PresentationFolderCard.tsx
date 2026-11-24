import Link from "next/link";
import Image from "next/image";
import type { Template } from "@/types/template";
import { resolveSafeCoverUrl } from "@/lib/safe-covers";
import { cx } from "@/lib/cx";

interface PresentationFolderCardProps {
  kitSlug: string;
  templates: Pick<Template, "id" | "slug" | "previewImageUrl">[];
  className?: string;
  /** Segmento da sub-rota (`/kits/[slug]/<routeSegment>`). Default
   * "apresentacoes" preserva o comportamento original. */
  routeSegment?: string;
  /** Título exibido no card. Default "Apresentações". */
  title?: string;
  /** Descrição exibida no card. Default do texto original de
   * Apresentações. */
  description?: string;
  /** Texto do link de ação. Default "Ver apresentações". */
  ctaLabel?: string;
}

const STACK_ROTATIONS = ["-rotate-6", "rotate-1", "rotate-6"];

/**
 * Card-pasta de destaque para agrupar um subconjunto de templates de um
 * kit fora do grid denso — não é um ícone de pasta genérico, é uma pilha
 * de capas reais sobrepostas (mesmas imagens do TemplatePreview/
 * TemplateCard, nunca recriadas), pensada pra parecer uma coleção de
 * materiais profissionais. Sempre um único `<Link>` pra
 * `/kits/[slug]/<routeSegment>`; deliberadamente renderizado fora do
 * grid denso de templates (ver src/app/kits/[slug]/page.tsx) pra ficar
 * maior e com mais destaque que um TemplateCard.
 *
 * Nasceu só pra `category: "Apresentação"` (daí o nome do arquivo/
 * componente); generalizado em 2026-10-03 (pedido da Ana) para também
 * agrupar `category: "Conteúdo Jurídico"` do Kit Institucional
 * Advocacia, sem duplicar este componente — os props opcionais têm
 * default nos valores originais de Apresentações, então todo call site
 * existente (Kit Social Media) continua com o mesmo comportamento,
 * byte a byte, sem precisar ser alterado.
 */
export function PresentationFolderCard({
  kitSlug,
  templates,
  className,
  routeSegment = "apresentacoes",
  title = "Apresentações",
  description = "Materiais para apresentar aos seus clientes",
  ctaLabel = "Ver apresentações",
}: PresentationFolderCardProps) {
  const stack = templates.slice(0, 3);

  return (
    <Link
      href={`/kits/${kitSlug}/${routeSegment}`}
      className={cx(
        "group relative grid items-center gap-8 overflow-hidden rounded-[3px] border border-mosaico-border/40 bg-mosaico-bg px-6 py-10 transition-shadow duration-300 hover:shadow-[0_36px_70px_-32px_rgba(46,25,16,0.35)] sm:px-10 lg:grid-cols-[minmax(0,300px)_1fr] lg:gap-14 lg:px-14 lg:py-12",
        className,
      )}
    >
      <div
        aria-hidden
        className="absolute top-1/2 left-1/2 -z-10 size-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-mosaico-accent/20 blur-3xl lg:left-[22%]"
      />

      {/* Pilha de capas reais — nunca um ícone de pasta genérico */}
      <div className="relative mx-auto h-[200px] w-full max-w-[260px] sm:h-[240px]">
        {stack.map((template, i) => (
          <div
            key={template.id}
            aria-hidden
            style={{ zIndex: stack.length - i }}
            className={cx(
              "absolute top-[10%] left-[10%] h-[80%] w-[80%] overflow-hidden rounded-[2px] border border-mosaico-border/40 bg-mosaico-border/20 shadow-[0_20px_40px_-20px_rgba(46,25,16,0.35)] transition-transform duration-300 group-hover:-translate-y-1",
              STACK_ROTATIONS[i % STACK_ROTATIONS.length],
            )}
          >
            {(() => {
              const safeUrl = resolveSafeCoverUrl(template.slug);
              // `fill` ancora no próprio div absolute/h-[80%]/w-[80%] acima
              // (já é um contexto de posicionamento válido) — mesmo
              // resultado visual do <img className="h-full w-full
              // object-cover"> anterior. Pilha pequena (3 capas, card
              // único por kit) — sem `sizes`/`priority` especiais, usa o
              // default do navegador (carregamento lazy já é adequado
              // aqui, nunca é a primeira coisa vista na página do kit).
              return (
                safeUrl && (
                  <Image src={safeUrl} alt="" fill className="object-cover" />
                )
              );
            })()}
          </div>
        ))}
      </div>

      <div className="text-center lg:text-left">
        <span className="inline-block rounded-full bg-mosaico-accent/15 px-3 py-1 font-sans text-[10px] font-semibold tracking-[0.15em] text-mosaico-accent-deep uppercase">
          Coleção
        </span>
        <h3 className="mt-4 font-serif text-3xl text-mosaico-ink sm:text-4xl">
          {title}
        </h3>
        <p className="mx-auto mt-3 max-w-sm font-sans text-base text-mosaico-ink-soft lg:mx-0">
          {description}
        </p>
        <p className="mt-5 inline-flex items-center gap-2 font-sans text-sm font-semibold text-mosaico-accent-deep">
          {ctaLabel}
          <span
            aria-hidden
            className="transition-transform duration-300 group-hover:translate-x-1"
          >
            →
          </span>
        </p>
      </div>
    </Link>
  );
}
