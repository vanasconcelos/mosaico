"use client";

import { useActionState } from "react";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { atualizarSenhaAction, type AuthActionState } from "../actions";

const initialState: AuthActionState = { error: null };

const inputClass =
  "mt-1 w-full rounded-[3px] border border-mosaico-border/40 bg-mosaico-bg px-4 py-3 font-sans text-mosaico-ink outline-none focus:border-mosaico-accent-deep";

/**
 * Só renderizado pelo page.tsx quando já confirmou sessão válida —
 * `atualizarSenhaAction` (actions.ts) ainda rejeita sozinho se a sessão
 * cair entre a checagem e o envio do formulário (ex.: expirou no meio),
 * nunca confia só na checagem feita antes de montar este componente.
 */
export function AtualizarSenhaForm() {
  const [state, formAction, pending] = useActionState(
    atualizarSenhaAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <label className="block font-sans text-sm text-mosaico-ink-soft">
        Nova senha
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
          Não foi possível atualizar a senha. O link pode ter expirado — peça
          um novo em &quot;Esqueci minha senha&quot;.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-mosaico-accent-deep px-7 py-3.5 font-sans text-sm font-semibold tracking-wide text-mosaico-bg uppercase transition-colors hover:bg-mosaico-ink disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Salvar nova senha"}
      </button>
    </form>
  );
}
