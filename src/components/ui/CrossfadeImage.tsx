"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { cx } from "@/lib/cx";

/** `sizes` padrão — mesma lógica de TemplatePreview.DEFAULT_SIZES (Fase
 * 4.4): cobre o caso mais comum, quem usa este componente numa célula bem
 * menor/maior (ex.: PhoneShowcaseSection) passa o seu próprio valor. */
const DEFAULT_SIZES = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw";

interface CrossfadeImageProps {
  /** URLs reais já cadastradas (nunca gerado aqui) — 1 item fica estático,
   * 2+ alternam em crossfade contínuo. */
  images: string[];
  alt: string;
  intervalMs?: number;
  className?: string;
  /** Atributo `sizes` do `next/image` (Fase 4.4) — ver TemplatePreview. */
  sizes?: string;
  /** `priority` do `next/image` (Fase 4.4), aplicado só à primeira imagem
   * do grupo (`index === 0`) — a única visível no primeiro frame; as
   * demais começam com `opacity: 0` e só importam depois do primeiro
   * crossfade, então seguem lazy por padrão (ver comentário abaixo). */
  priority?: boolean;
}

/**
 * Crossfade genérico entre imagens reais — miolo extraído de
 * `KitShowcaseCell` (2026-10-20) para ser reaproveitado fora do wrapper
 * `aspect-[4/5]` fixo daquele componente (ex.: `PhoneShowcaseSection`, que
 * precisa de outra proporção). `KitShowcaseCell` agora é só um wrapper fino
 * deste componente — comportamento idêntico, zero regressão.
 *
 * Respeita `prefers-reduced-motion`: com a preferência ativa, só a primeira
 * imagem fica visível, sem troca — a imagem parada já é conteúdo real e
 * legível, nunca um placeholder.
 */
export function CrossfadeImage({
  images,
  alt,
  intervalMs = 4000,
  className,
  sizes = DEFAULT_SIZES,
  priority = false,
}: CrossfadeImageProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const id = setInterval(() => {
      setIndex((current) => (current + 1) % images.length);
    }, intervalMs);

    return () => clearInterval(id);
  }, [images.length, intervalMs]);

  return (
    <div className={cx("relative overflow-hidden", className)}>
      {images.map((src, i) => {
        // Acessibilidade (Fase 4.9, item 4): todas as imagens do grupo
        // continuam no DOM ao mesmo tempo (é isso que permite o crossfade
        // por opacidade — ver comentário abaixo sobre `priority`/lazy, que
        // não muda), mas só a que está com `opacity-100` agora é conteúdo
        // real pra quem usa leitor de tela: as outras são a mesma peça em
        // outro momento da rotação, nunca informação adicional. Sem isso,
        // um grupo de até 4 imagens (ver KitCatalogCard) chegava a repetir
        // o mesmo `alt` 4 vezes na árvore de acessibilidade — confirmado
        // na auditoria B4.8. Mantemos `alt` real só na imagem ativa;
        // `alt=""` + `aria-hidden` nas demais (técnica WCAG H67, já usada
        // em TemplateGallery.tsx pras miniaturas decorativas) — a cada
        // troca de `index`, a imagem exposta muda junto, nunca duas ao
        // mesmo tempo nem nenhuma.
        const isActive = i === index;
        return (
          <Image
            key={src}
            src={src}
            alt={isActive ? alt : ""}
            aria-hidden={isActive ? undefined : true}
            fill
            sizes={sizes}
            priority={priority && i === 0}
            className={cx(
              "object-cover transition-opacity duration-1000 ease-in-out motion-reduce:transition-none",
              isActive ? "opacity-100" : "opacity-0",
            )}
          />
        );
      })}
    </div>
  );
}
