"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/lib/cx";

function RetryIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12a7.5 7.5 0 0 1 13-5.1M19.5 12a7.5 7.5 0 0 1-13 5.1M16.5 4.5v3h-3M7.5 19.5v-3h3"
      />
    </svg>
  );
}

interface SignedImageProps {
  /** URL assinada do Supabase Storage (ou qualquer URL de imagem comum) —
   * nunca modificada por este componente. Um retry refaz a MESMA
   * requisição (via remount forçado pela `key`), nunca altera a string
   * da URL — alterá-la (ex.: acrescentar um parâmetro) invalidaria a
   * assinatura. */
  src: string;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  /** `true` pras miniaturas da galeria: o estado de erro vira um
   * indicador pequeno e não-interativo — nunca um `<button>` de retry
   * aninhado dentro do `<button>` que já seleciona a miniatura (seria
   * HTML inválido). Selecionar a miniatura já monta a imagem principal
   * com a mesma URL, que funciona como uma nova tentativa de verdade.
   * `false` (padrão) é a imagem principal: mensagem + botão "Tentar
   * novamente" próprios. */
  compact?: boolean;
}

/**
 * `<img>` com estado de carregamento/erro visível — pensado pra URLs
 * assinadas do bucket pago (Fase 4.11, item 1 da auditoria B4.10: "não
 * apresente uma imagem quebrada sem explicação"). Nunca usa `next/image`
 * de propósito: o otimizador do Next precisaria buscar a URL assinada
 * ele mesmo (via `remotePatterns`, nunca configurado pro domínio do
 * Supabase) e cachear o resultado — como cada URL já é de curta duração
 * (60s) e de acesso só depois de confirmado o pagamento, rodar esse
 * conteúdo por um cache intermediário de otimização de imagem adicionaria
 * uma superfície nova sem necessidade real (a imagem em si já não se
 * beneficia de redimensionamento — é exibida em tamanho real/próximo do
 * original). `<img>` cru, com `loading`/`decoding`/`fetchPriority`
 * explícitos, cobre o pedido sem essa complexidade extra.
 */
export function SignedImage({
  src,
  alt,
  className,
  loading = "eager",
  fetchPriority = "auto",
  compact = false,
}: SignedImageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [lastSrc, setLastSrc] = useState(src);

  // Troca de página na galeria (a `src` muda, o mesmo <img> é reaproveitado
  // pelo React — não remonta) precisa reavaliar o estado do zero; sem
  // isso, o status "loaded" de uma página antiga ficaria colado na nova.
  // Ajuste durante a renderização (padrão recomendado pelo React pra
  // "resetar estado quando uma prop muda"), não dentro de um `useEffect`
  // — evita o re-render em cascata que um `setState` síncrono num efeito
  // causaria.
  if (src !== lastSrc) {
    setLastSrc(src);
    setStatus("loading");
  }

  function retry() {
    setStatus("loading");
    setAttempt((current) => current + 1);
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      {status === "loading" && <Skeleton className="absolute inset-0" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={attempt}
        src={src}
        alt={status === "error" ? "" : alt}
        aria-hidden={status === "error" ? true : undefined}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        className={cx(
          className,
          "transition-opacity duration-300",
          status === "loaded" ? "opacity-100" : "opacity-0",
        )}
      />
      {status === "error" && compact && (
        <span
          role="status"
          aria-label="Não foi possível carregar esta miniatura"
          className="absolute inset-0 flex items-center justify-center bg-mosaico-bg text-mosaico-ink-soft/60"
        >
          <RetryIcon className="h-4 w-4" />
        </span>
      )}
      {status === "error" && !compact && (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-mosaico-bg px-4 text-center"
        >
          <RetryIcon className="h-5 w-5 text-mosaico-ink-soft" />
          <span className="font-sans text-xs text-mosaico-ink-soft">
            Não foi possível carregar esta imagem.
          </span>
          <button
            type="button"
            onClick={retry}
            className="font-sans text-xs font-semibold text-mosaico-accent-deep underline underline-offset-2"
          >
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}
