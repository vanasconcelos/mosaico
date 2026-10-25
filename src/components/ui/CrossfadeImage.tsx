"use client";

import { useEffect, useState } from "react";
import { cx } from "@/lib/cx";

interface CrossfadeImageProps {
  /** URLs reais já cadastradas (nunca gerado aqui) — 1 item fica estático,
   * 2+ alternam em crossfade contínuo. */
  images: string[];
  alt: string;
  intervalMs?: number;
  className?: string;
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
      {images.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt={alt}
          className={cx(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out motion-reduce:transition-none",
            i === index ? "opacity-100" : "opacity-0",
          )}
        />
      ))}
    </div>
  );
}
