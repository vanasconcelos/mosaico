"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { loginAction, type AuthActionState } from "../actions";

const initialState: AuthActionState = { error: null };

const inputClass =
  "mt-1 w-full rounded-[3px] border border-mosaico-border/40 bg-mosaico-bg px-4 py-3 font-sans text-mosaico-ink outline-none focus:border-mosaico-accent-deep";

const GENERIC_LOGIN_ERROR = "Não foi possível entrar. Confira o e-mail e a senha.";

/** Mesmo padrão já usado em DownloadTemplateButton/EditInCanvaButton:
 * nunca mostrar o código bruto do Supabase, sempre uma frase decidida
 * aqui. `loginAction` também devolve mensagens já formatadas (ex.:
 * "Preencha e-mail e senha.") pra validação de campo vazio — essas
 * passam direto, sem cair no mapeamento de código abaixo. */
function messageForLoginError(error: string): string {
  if (error === "Preencha e-mail e senha.") return error;
  switch (error) {
    case "email_not_confirmed":
      return "Confirme seu e-mail antes de entrar — veja o link que enviamos pra sua caixa de entrada.";
    case "invalid_credentials":
      return "E-mail ou senha incorretos.";
    case "too_many_requests":
      return "Muitas tentativas em pouco tempo. Aguarde um pouco e tente de novo.";
    default:
      return GENERIC_LOGIN_ERROR;
  }
}

export default function LoginPage() {
  // `useSearchParams` precisa de um boundary de Suspense pro build
  // conseguir pré-renderizar a casca da página (exigência do Next.js,
  // não opcional) — o formulário em si não precisa de nenhum dado
  // assíncrono, então o fallback nunca chega a aparecer de verdade.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const searchParams = useSearchParams();
  // Só repassado pro Server Action via campo oculto — a página nunca
  // decide sozinha pra onde ir, e `loginAction` revalida esse valor
  // contra uma lista fechada de caminhos antes de redirecionar.
  const next = searchParams.get("next") ?? "";
  // Setado por cadastrarAction no redirect pós-cadastro (actions.ts) —
  // antes não aparecia nada aqui, a pessoa só via o formulário vazio
  // sem nenhuma pista de que precisava confirmar o e-mail primeiro.
  const cadastroEnviado = searchParams.get("cadastro") === "enviado";

  return (
    <main className="flex flex-1 items-center bg-mosaico-bg py-20">
      <Container>
        <div className="mx-auto max-w-sm">
          <p className="font-sans text-xs font-semibold tracking-[0.2em] text-mosaico-accent-deep uppercase">
            Minha conta
          </p>
          <h1 className="mt-3 font-serif text-3xl text-mosaico-ink sm:text-4xl">
            Entrar
          </h1>

          {cadastroEnviado && !state.error && (
            <p className="mt-4 font-sans text-sm text-mosaico-ink-soft">
              Conta criada. Enviamos um e-mail de confirmação — abra o link
              nele antes de entrar.
            </p>
          )}

          <form action={formAction} className="mt-8 space-y-5">
            <input type="hidden" name="next" value={next} />
            <label className="block font-sans text-sm text-mosaico-ink-soft">
              E-mail
              <input type="email" name="email" required className={inputClass} />
            </label>
            <label className="block font-sans text-sm text-mosaico-ink-soft">
              Senha
              <input
                type="password"
                name="senha"
                required
                autoComplete="current-password"
                className={inputClass}
              />
            </label>

            {state.error && (
              <p className="font-sans text-sm text-mosaico-red">
                {messageForLoginError(state.error)}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-full bg-mosaico-accent-deep px-7 py-3.5 font-sans text-sm font-semibold tracking-wide text-mosaico-bg uppercase transition-colors hover:bg-mosaico-ink disabled:opacity-60"
            >
              {pending ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <div className="mt-6 flex justify-between font-sans text-sm text-mosaico-ink-soft">
            <Link href="/recuperar-senha" className="underline underline-offset-4">
              Esqueci minha senha
            </Link>
            <Link
              href={next ? `/cadastro?next=${encodeURIComponent(next)}` : "/cadastro"}
              className="underline underline-offset-4"
            >
              Criar conta
            </Link>
          </div>
        </div>
      </Container>
    </main>
  );
}
