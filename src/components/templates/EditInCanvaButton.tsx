"use client";

import { useState } from "react";
import Link from "next/link";
import { cx } from "@/lib/cx";
import { extractSafeCanvaUrl } from "@/lib/canva-url";

interface EditInCanvaButtonProps {
  /** Nunca o link em si — o componente busca `canva_editable_url` no
   * clique, via `/api/templates/[slug]/edit-link` (único lugar
   * autorizado a devolvê-lo, depois de checar sessão + `has_paid_access`
   * no servidor). O componente nunca decide por conta própria que o
   * usuário pagou; só interpreta o status HTTP que o servidor devolve. */
  slug: string;
  /** Resolvido no servidor (page.tsx) — `false` quando
   * `canva_editable_url` ainda não está configurado para este slug.
   * Nunca o link em si, só o booleano. Quando `false`, nenhum botão
   * clicável é renderizado — só um estado informativo "em breve",
   * nunca uma ação que o servidor recusaria (2026-11-23: antes deste
   * campo, o botão aparecia sempre, incondicionalmente). */
  editLinkAvailable: boolean;
  className?: string;
}

type Status = "idle" | "loading" | "error";

// Validação da URL devolvida pela API: src/lib/canva-url.ts (mesma
// lógica de sempre, agora numa única fonte de verdade reutilizável por
// ferramentas fora do navegador, ex.: scripts/import-canva-links.mjs).

const GENERIC_ERROR =
  "Não foi possível abrir o Canva agora. Tente novamente em instantes.";

/** Mensagem por código de erro do endpoint — nunca o texto bruto do
 * servidor, sempre uma frase decidida aqui, pra nunca expor detalhe
 * interno (código de erro do Postgres, stack, etc.) na interface. */
function messageForErrorCode(code: string | null): string {
  switch (code) {
    case "access_denied":
      return "O acesso completo aos kits é liberado só depois da compra confirmada.";
    case "too_many_requests":
      return "Muitas tentativas em pouco tempo. Aguarde um pouco e tente de novo.";
    case "link_not_available":
      return "Este link ainda não está disponível. Tente novamente mais tarde.";
    default:
      return GENERIC_ERROR;
  }
}

export function EditInCanvaButton({
  slug,
  editLinkAvailable,
  className,
}: EditInCanvaButtonProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function handleClick() {
    // Impede duplo clique/duplo request enquanto a checagem está em voo.
    if (status === "loading") return;

    setStatus("loading");
    setErrorCode(null);

    let response: Response;
    try {
      response = await fetch(`/api/templates/${encodeURIComponent(slug)}/edit-link`, {
        method: "GET",
        cache: "no-store",
      });
    } catch {
      // Falha de rede — nunca loga a URL (não há URL nenhuma aqui ainda).
      console.error("EditInCanvaButton: falha de rede ao consultar o link");
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
        // Resposta sem corpo JSON válido — segue com code = null (mensagem genérica).
      }
      // Só o status e o código — nunca corpo completo, nunca URL.
      console.error("EditInCanvaButton: edit-link recusou a requisição", {
        status: response.status,
        code,
      });
      setStatus("error");
      setErrorCode(code);
      return;
    }

    const body = await response.json().catch(() => null);
    const safeUrl = extractSafeCanvaUrl(body?.editLink);

    if (!safeUrl) {
      // Sucesso HTTP mas corpo fora do formato esperado — nunca loga o
      // valor recebido, só o fato de ter sido rejeitado.
      console.error("EditInCanvaButton: resposta com link em formato inesperado");
      setStatus("error");
      setErrorCode(null);
      return;
    }

    // `safeUrl` nunca é guardado em estado/DOM — vive só nesta variável
    // local, usada uma vez, e descartada ao sair desta função.
    window.open(safeUrl, "_blank", "noopener,noreferrer");
    setStatus("idle");
  }

  if (!editLinkAvailable) {
    // Nenhum botão clicável, nenhuma promessa de ação indisponível —
    // mesmo padrão visual "em preparação" já usado em outras partes do
    // site (ex.: página do kit sem templates reais), só adaptado ao
    // tamanho do CTA principal pra não deslocar o layout ao lado do
    // botão de download.
    return (
      <span
        className={cx(
          "inline-flex w-fit items-center gap-2 rounded-full border border-mosaico-border/40 px-8 py-4 font-sans text-sm font-semibold tracking-wide text-mosaico-ink-soft uppercase",
          className,
        )}
      >
        Edição no Canva em breve
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 lg:items-start">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "loading"}
        aria-busy={status === "loading"}
        className={cx(
          "inline-flex w-fit items-center gap-2 rounded-full bg-mosaico-accent-deep px-8 py-4 font-sans text-sm font-semibold tracking-wide text-mosaico-bg uppercase transition-colors hover:bg-mosaico-ink disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        {status === "loading" ? "Verificando acesso..." : "Editar no Canva"}
        {status !== "loading" && <span aria-hidden>→</span>}
      </button>

      {status === "error" && (
        <p
          role="status"
          className="max-w-xs text-center font-sans text-xs text-mosaico-red lg:text-left"
        >
          {errorCode === "unauthenticated" ? (
            <>
              Entre na sua conta para acessar este template.{" "}
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
