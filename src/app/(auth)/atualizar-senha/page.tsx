import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { createClient } from "@/lib/supabase/server";
import { AtualizarSenhaForm } from "./AtualizarSenhaForm";

/** Página de fluxo de autenticação — nunca indexável (ver nota em
 * src/app/robots.ts sobre por que isso não vira `disallow` lá). */
export const metadata: Metadata = {
  title: "Definir nova senha",
  robots: { index: false, follow: false },
};

/**
 * Página que `/auth/confirm` abre depois de trocar o código do link de
 * "recuperar senha" por uma sessão real (fluxo corrigido — antes este
 * redirectTo apontava direto pra cá, sem nenhuma troca de código por
 * sessão no meio do caminho). Checa a sessão aqui, no servidor, antes de
 * sequer mostrar o formulário — sem sessão válida (link expirado, já
 * usado, ou alguém chegando nesta URL por fora do fluxo), mostra uma
 * orientação pra reiniciar em `/recuperar-senha`, nunca o formulário.
 * `atualizarSenhaAction` (Server Action) ainda rejeita sozinho por conta
 * própria se a sessão cair entre esta checagem e o envio do formulário —
 * esta página é a primeira camada, não a única.
 */
export default async function AtualizarSenhaPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  return (
    <main className="flex flex-1 items-center bg-mosaico-bg py-20">
      <Container>
        <div className="mx-auto max-w-sm">
          <p className="font-sans text-xs font-semibold tracking-[0.2em] text-mosaico-accent-deep uppercase">
            Minha conta
          </p>
          <h1 className="mt-3 font-serif text-3xl text-mosaico-ink sm:text-4xl">
            Definir nova senha
          </h1>

          {claimsData?.claims ? (
            <AtualizarSenhaForm />
          ) : (
            <>
              <p className="mt-6 font-sans text-sm text-mosaico-ink-soft">
                Este link de recuperação não é mais válido — pode já ter sido
                usado ou ter expirado.
              </p>
              <Link
                href="/recuperar-senha"
                className="mt-6 inline-block w-full rounded-full bg-mosaico-accent-deep px-7 py-3.5 text-center font-sans text-sm font-semibold tracking-wide text-mosaico-bg uppercase transition-colors hover:bg-mosaico-ink"
              >
                Pedir um novo link
              </Link>
            </>
          )}
        </div>
      </Container>
    </main>
  );
}
