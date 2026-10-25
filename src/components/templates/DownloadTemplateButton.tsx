"use client";

import { useState } from "react";
import Link from "next/link";
import { cx } from "@/lib/cx";

interface DownloadTemplateButtonProps {
  /** Nome do template, só para nomear o arquivo baixado em caso de erro
   * de leitura do header `Content-Disposition`. */
  title: string;
  slug: string;
  className?: string;
}

type Status = "idle" | "loading" | "error";

const GENERIC_ERROR = "Não foi possível baixar o arquivo agora. Tente novamente em instantes.";

function messageForErrorCode(code: string | null): string {
  switch (code) {
    case "access_denied":
      return "O acesso completo aos kits é liberado só depois da compra confirmada.";
    case "too_many_requests":
      return "Muitas tentativas em pouco tempo. Aguarde um pouco e tente de novo.";
    case "content_not_available":
      return "Este conteúdo ainda não está disponível. Tente novamente mais tarde.";
    default:
      return GENERIC_ERROR;
  }
}

/**
 * "Baixar modelo pronto" — mesmo padrão de segurança do
 * `EditInCanvaButton`: nunca decide por conta própria que o usuário pagou,
 * só clica, chama `/api/templates/[slug]/download` (que monta o .zip no
 * servidor depois de checar sessão + `has_paid_access`) e interpreta o
 * status HTTP devolvido. Nunca busca arquivo local nem monta o .zip no
 * navegador — isso mudou porque o conteúdo completo agora vive só no
 * bucket privado (ver Fase B3), não mais em `public/templates`.
 */
export function DownloadTemplateButton({ title, slug, className }: DownloadTemplateButtonProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function handleClick() {
    if (status === "loading") return;

    setStatus("loading");
    setErrorCode(null);

    let response: Response;
    try {
      response = await fetch(`/api/templates/${encodeURIComponent(slug)}/download`, {
        method: "GET",
        cache: "no-store",
      });
    } catch {
      console.error("DownloadTemplateButton: falha de rede ao baixar");
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
        // Resposta sem corpo JSON — segue com code = null (mensagem genérica).
      }
      console.error("DownloadTemplateButton: download recusado", {
        status: response.status,
        code,
      });
      setStatus("error");
      setErrorCode(code);
      return;
    }

    // Resposta já é o .zip — nunca passa por estado React, só vira um
    // blob local descartado logo em seguida.
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("idle");
  }

  return (
    <div className="flex flex-col items-center gap-2 sm:items-start">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "loading"}
        aria-busy={status === "loading"}
        aria-label={`Baixar modelo pronto de ${title}`}
        className={cx(
          "inline-flex w-fit items-center gap-2 rounded-full border border-mosaico-accent-deep px-8 py-4 font-sans text-sm font-semibold tracking-wide text-mosaico-accent-deep uppercase transition-colors hover:bg-mosaico-accent-deep hover:text-mosaico-bg disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        {status === "loading" ? "Preparando arquivo…" : "Baixar modelo pronto"}
      </button>

      {status === "error" && (
        <p role="status" className="max-w-xs text-center font-sans text-xs text-mosaico-red sm:text-left">
          {errorCode === "unauthenticated" ? (
            <>
              Entre na sua conta para baixar este template.{" "}
              <Link
                href={`/login?next=${encodeURIComponent(`/templates/${slug}`)}`}
                className="underline underline-offset-2"
              >
                Fazer login
              </Link>
              .
            </>
          ) : errorCode === "access_denied" ? (
            <>
              {messageForErrorCode(errorCode)}{" "}
              <Link href="/conta" className="underline underline-offset-2">
                Ver como obter acesso
              </Link>
              .
            </>
          ) : (
            messageForErrorCode(errorCode)
          )}
        </p>
      )}
    </div>
  );
}
