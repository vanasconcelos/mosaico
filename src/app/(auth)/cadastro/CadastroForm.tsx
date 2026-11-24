"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { cadastrarAction, type AuthActionState } from "../actions";

const initialState: AuthActionState = { error: null };

const inputClass =
  "mt-1 w-full rounded-[3px] border border-mosaico-border/40 bg-mosaico-bg px-4 py-3 font-sans text-mosaico-ink outline-none focus:border-mosaico-accent-deep";

const GENERIC_CADASTRO_ERROR =
  "Não foi possível criar a conta. Verifique os dados e tente de novo.";

/** Mesmo padrão de `login/LoginForm.tsx`: nunca mostrar o código bruto do
 * Supabase, sempre uma frase decidida aqui. Códigos confirmados na
 * documentação oficial de erros do Supabase Auth para `signUp` —
 * nenhum inventado. `cadastrarAction` também devolve mensagens já
 * formatadas (ex.: "Preencha e-mail e senha.") pra validação de campo
 * vazio — essas passam direto, sem cair no mapeamento de código. */
function messageForCadastroError(error: string): string {
  if (error === "Preencha e-mail e senha.") return error;
  switch (error) {
    case "user_already_exists":
      return "Já existe uma conta com esse e-mail. Tente entrar, em vez de criar outra.";
    case "weak_password":
      return "Escolha uma senha mais forte — use pelo menos 6 caracteres, evitando sequências óbvias.";
    case "over_email_send_rate_limit":
      return "Muitas tentativas em pouco tempo. Aguarde um pouco antes de tentar de novo.";
    case "signup_disabled":
      return "Novos cadastros estão temporariamente desativados. Tente novamente mais tarde.";
    case "validation_failed":
    case "email_address_invalid":
      return "Confira se o e-mail foi digitado corretamente.";
    case "signup_possibly_existing_account":
      // Mensagem neutra de propósito — nunca confirma que esse e-mail
      // já tem conta, só sugere os dois caminhos possíveis (mesma
      // cautela contra enumeração de contas de cadastrarAction).
      return "Não foi possível concluir o cadastro com esses dados. Tente entrar ou recuperar sua senha.";
    default:
      return GENERIC_CADASTRO_ERROR;
  }
}

export function CadastroForm() {
  const [state, formAction, pending] = useActionState(cadastrarAction, initialState);
  const next = useSearchParams().get("next") ?? "";

  return (
    <main className="flex flex-1 items-center bg-mosaico-bg py-20">
      <Container>
        <div className="mx-auto max-w-sm">
          <p className="font-sans text-xs font-semibold tracking-[0.2em] text-mosaico-accent-deep uppercase">
            Minha conta
          </p>
          <h1 className="mt-3 font-serif text-3xl text-mosaico-ink sm:text-4xl">
            Criar conta
          </h1>
          <p className="mt-3 font-sans text-sm text-mosaico-ink-soft">
            Depois de criar a conta, confirme seu e-mail para poder entrar.
          </p>

          <form action={formAction} className="mt-8 space-y-5">
            <input type="hidden" name="next" value={next} />
            <label className="block font-sans text-sm text-mosaico-ink-soft">
              E-mail
              <input type="email" name="email" required className={inputClass} />
            </label>
            <label className="block font-sans text-sm text-mosaico-ink-soft">
              Senha
              <PasswordInput
                name="senha"
                required
                minLength={6}
                autoComplete="new-password"
                className={inputClass}
              />
            </label>

            {state.error && (
              <p role="alert" className="font-sans text-sm text-mosaico-red">
                {messageForCadastroError(state.error)}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-full bg-mosaico-accent-deep px-7 py-3.5 font-sans text-sm font-semibold tracking-wide text-mosaico-bg uppercase transition-colors hover:bg-mosaico-ink disabled:opacity-60"
            >
              {pending ? "Criando..." : "Criar conta"}
            </button>
          </form>

          <p className="mt-6 font-sans text-sm text-mosaico-ink-soft">
            Já tem conta?{" "}
            <Link
              href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
              className="underline underline-offset-4"
            >
              Entrar
            </Link>
          </p>
        </div>
      </Container>
    </main>
  );
}
