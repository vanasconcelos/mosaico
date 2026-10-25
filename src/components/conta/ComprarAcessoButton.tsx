"use client";

import { useState } from "react";
import { cx } from "@/lib/cx";

type Status = "idle" | "loading" | "error";

/**
 * Hosts aceitos pra redirecionar o navegador depois do POST em
 * `/api/checkout` — mesmo princípio de `EditInCanvaButton.
 * extractSafeCanvaUrl`: mesmo vindo da própria API (não do usuário),
 * nunca navega pra um valor sem checar antes que é de fato o Mercado
 * Pago (produção ou sandbox).
 */
const ALLOWED_CHECKOUT_HOSTS = new Set([
  "mercadopago.com",
  "mercadopago.com.br",
]);

function extractSafeCheckoutUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const isAllowedHost = [...ALLOWED_CHECKOUT_HOSTS].some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
  );
  return isAllowedHost ? value : null;
}

const GENERIC_ERROR = "Não foi possível iniciar a compra agora. Tente novamente em instantes.";

function messageForErrorCode(code: string | null): string {
  switch (code) {
    case "checkout_not_configured":
      return "A compra ainda não está disponível — estamos finalizando essa parte.";
    case "unauthenticated":
      return "Sua sessão expirou. Atualize a página e entre novamente.";
    default:
      return GENERIC_ERROR;
  }
}

/**
 * Botão "Comprar acesso" em /conta — liga o `/api/checkout` (já existia,
 * já checa sessão no servidor, já cria a Preference do Mercado Pago),
 * que até agora não tinha nenhum botão chamando ele. Nunca decide por
 * conta própria que a compra foi concluída: só abre o checkout e deixa
 * o webhook (já existente) confirmar o pagamento e liberar o acesso.
 */
export function ComprarAcessoButton({ className }: { className?: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function handleClick() {
    if (status === "loading") return;

    setStatus("loading");
    setErrorCode(null);

    let response: Response;
    try {
      response = await fetch("/api/checkout", { method: "POST", cache: "no-store" });
    } catch {
      console.error("ComprarAcessoButton: falha de rede ao iniciar checkout");
      setStatus("error");
      setErrorCode(null);
      return;
    }

    if (!response.ok) {
      let code: string | null = null;
      try {
        const body = await response.json();
        if (typeof body?.error === "string") code = body.error;
      } catch {
        // Sem corpo JSON válido — segue com code = null.
      }
      console.error("ComprarAcessoButton: checkout recusado", {
        status: response.status,
        code,
      });
      setStatus("error");
      setErrorCode(code);
      return;
    }

    const body = await response.json().catch(() => null);
    const safeUrl = extractSafeCheckoutUrl(body?.init_point);

    if (!safeUrl) {
      console.error("ComprarAcessoButton: resposta sem init_point válido");
      setStatus("error");
      setErrorCode(null);
      return;
    }

    window.location.href = safeUrl;
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "loading"}
        aria-busy={status === "loading"}
        className={cx(
          "inline-flex w-fit items-center gap-2 rounded-full bg-mosaico-accent-deep px-7 py-3.5 font-sans text-sm font-semibold tracking-wide text-mosaico-bg uppercase transition-colors hover:bg-mosaico-ink disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        {status === "loading" ? "Abrindo checkout..." : "Comprar acesso"}
      </button>

      {status === "error" && (
        <p role="status" className="font-sans text-xs text-mosaico-red">
          {messageForErrorCode(errorCode)}
        </p>
      )}
    </div>
  );
}
