"use client";

import { useState } from "react";
import type { TemplateAspectRatio } from "@/types/template";
import { cx } from "@/lib/cx";

interface TemplateGalleryProps {
  title: string;
  images: string[];
  aspectRatio: TemplateAspectRatio;
  className?: string;
}

/**
 * Galeria de um template com várias páginas (ex.: Carrossel): peça grande
 * da página ativa + fileira de miniaturas clicáveis. Só usada quando
 * `template.carouselImageUrls` existe — ver TemplateDetail. Client
 * component só por causa da troca de página ativa; a apresentação em si
 * (preservar proporção, object-cover) segue a mesma lógica de
 * TemplatePreview.
 */
export function TemplateGallery({
  title,
  images,
  aspectRatio,
  className,
}: TemplateGalleryProps) {
  const [active, setActive] = useState(0);

  return (
    <div className={className}>
      <div
        style={{ aspectRatio }}
        className="relative w-full overflow-hidden rounded-[3px] border border-mosaico-border/40 shadow-[0_36px_70px_-32px_rgba(46,25,16,0.4)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[active]}
          alt={`${title} — página ${active + 1} de ${images.length}`}
          className="h-full w-full object-cover"
        />
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-7">
        {images.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`Ver página ${i + 1}`}
            aria-current={i === active}
            style={{ aspectRatio }}
            className={cx(
              "relative w-full overflow-hidden rounded-[2px] border transition-opacity",
              i === active
                ? "border-mosaico-accent-deep"
                : "border-mosaico-border/40 opacity-60 hover:opacity-100",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              aria-hidden
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
