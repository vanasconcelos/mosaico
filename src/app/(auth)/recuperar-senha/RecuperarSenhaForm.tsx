"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { recuperarSenhaAction, type RecuperarSenhaState } from "../actions";

const initialState: RecuperarSenhaState = { error: null, sent: false };

const inputClass =
  "mt-1 w-full rounded-[3px] border border-mosaico-border/40 bg-mosaico-bg px-4 py-3 font-sans text-mosaico-ink outline-none focus:border-mosaico-accent-deep";

export function RecuperarSenhaForm() {
  const [state, formAction, pending] = useActionState(
    recuperarSenhaAction,
    initialState,
  );
  const enviado = state.sent;

  return (
    <main className="flex flex-1 items-center bg-mosaico-bg py-20">
      <Container>
        <div className="mx-auto max-w-sm">
          <p className="font-sans text-xs font-semibold tracking-[0.2em] text-mosaico-accent-deep uppercase">
            Minha conta
          </p>
          <h1 className="mt-3 font-serif text-3xl text-mosaico-ink sm:text-4xl">
            Recuperar senha
          </h1>

          {enviado ? (
            <p
              role="status"
              aria-live="polite"
              className="mt-8 font-sans text-base text-mosaico-ink-soft"
            >
              Se houver uma conta com esse e-mail, enviamos um link para
              redefinir a senha.
            </p>
          ) : (
            <form action={formAction} className="mt-8 space-y-5">
              <label className="block font-sans text-sm text-mosaico-ink-soft">
                E-mail
                <input type="email" name="email" required className={inputClass} />
              </label>

              {state.error && (
                <p role="alert" className="font-sans text-sm text-mosaico-red">
                  Não foi possível enviar agora. Tente de novo.
                </p>
              )}

              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-full bg-mosaico-accent-deep px-7 py-3.5 font-sans text-sm font-semibold tracking-wide text-mosaico-bg uppercase transition-colors hover:bg-mosaico-ink disabled:opacity-60"
              >
                {pending ? "Enviando..." : "Enviar link de redefinição"}
              </button>
            </form>
          )}

          <p className="mt-6 font-sans text-sm text-mosaico-ink-soft">
            <Link href="/login" className="underline underline-offset-4">
              Voltar ao login
            </Link>
          </p>
        </div>
      </Container>
    </main>
  );
}
