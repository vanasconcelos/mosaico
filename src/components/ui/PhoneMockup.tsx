import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

interface PhoneMockupProps {
  children: ReactNode;
  className?: string;
  /** Flutuação vertical contínua e sutil (motion-safe). Fica num wrapper
   * interno de propósito: se ficasse no mesmo elemento da inclinação
   * estática (`className` costuma trazer um `-rotate-*`), a animação
   * substituiria o `transform` inteiro a cada frame e a peça perderia a
   * própria rotação enquanto flutua. */
  float?: boolean;
}

/**
 * Moldura de celular em CSS puro (sem foto de dispositivo real) — usada
 * para apresentar uma grade densa de templates como "produto real", não
 * como cards soltos. `children` deve preencher a área da tela.
 *
 * Reforçada em 2026-10-20 (a Ana achou que não parecia "um celular de
 * verdade"): botão lateral, câmera na ilha dinâmica e um brilho de vidro
 * diagonal (gradiente, só decorativo) — sem usar nenhuma foto de
 * dispositivo real (não temos esse ativo), só mais detalhe de CSS.
 */
export function PhoneMockup({
  children,
  className,
  float = true,
}: PhoneMockupProps) {
  return (
    <div className={cx("relative", className)}>
      <div
        className={cx(
          float &&
            "motion-safe:animate-[mosaico-float_7s_ease-in-out_infinite]",
        )}
      >
        <div className="relative rounded-[2.75rem] border-[9px] border-mosaico-ink bg-mosaico-ink shadow-[0_40px_80px_-28px_rgba(46,25,16,0.55)]">
          {/* botão lateral — só decorativo, mesmo tom da moldura */}
          <span className="absolute top-20 -right-[11px] h-10 w-[3px] rounded-full bg-mosaico-ink/70" />
          <span className="absolute top-36 -right-[11px] h-16 w-[3px] rounded-full bg-mosaico-ink/70" />
          <span className="absolute top-24 -left-[11px] h-14 w-[3px] rounded-full bg-mosaico-ink/70" />

          <div className="relative overflow-hidden rounded-[2.1rem] bg-mosaico-bg">
            {/* brilho de vidro — gradiente diagonal fixo, não compete com
                o conteúdo (muito sutil, z abaixo da ilha dinâmica) */}
            <div
              className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-br from-white/14 via-transparent to-transparent"
              aria-hidden
            />
            <div className="absolute top-2.5 left-1/2 z-10 flex h-6 w-28 -translate-x-1/2 items-center justify-end rounded-full bg-mosaico-ink pr-2">
              <span className="h-1.5 w-1.5 rounded-full bg-mosaico-bg/25" />
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
