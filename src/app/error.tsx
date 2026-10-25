"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Só no console do servidor/navegador — nunca exibido ao visitante,
    // nunca inclui dado de sessão ou link privado por não registrarmos
    // nada sensível na mensagem de erro em si.
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center bg-mosaico-bg py-24">
      <Container>
        <p className="font-sans text-xs font-semibold tracking-[0.2em] text-mosaico-accent-deep uppercase">
          Algo deu errado
        </p>
        <h1 className="mt-3 font-serif text-4xl text-mosaico-ink sm:text-5xl">
          Não conseguimos carregar esta página.
        </h1>
        <p className="mt-4 max-w-xl text-mosaico-ink-soft">
          Foi um erro temporário, não algo que você fez. Tente de novo —
          se continuar, volte ao catálogo.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-2 rounded-full bg-mosaico-accent-deep px-7 py-3.5 font-sans text-sm font-semibold tracking-wide text-mosaico-bg uppercase transition-colors hover:bg-mosaico-ink"
          >
            Tentar de novo
          </button>
          <Link
            href="/kits"
            className="inline-flex items-center gap-2 rounded-full border border-mosaico-border/40 px-7 py-3.5 font-sans text-sm font-semibold tracking-wide text-mosaico-ink uppercase transition-colors hover:bg-mosaico-surface"
          >
            Ver todos os kits
          </Link>
        </div>
      </Container>
    </main>
  );
}
