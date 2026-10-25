import { isValidSlug } from "@/lib/slug";

/**
 * Allowlist fechada de destinos internos pra onde login/cadastro/callback
 * de e-mail podem mandar a pessoa de volta depois de autenticar — nunca
 * confia no valor cru vindo do navegador. Só aceita `/conta`,
 * `/atualizar-senha` (destino fixo do callback de recuperação de senha —
 * ver `recuperarSenhaAction`, único lugar que gera esse valor),
 * `/templates/<slug>` ou `/kits/<slug>` com um slug que já passa pela
 * mesma validação das rotas de API (`isValidSlug` — só formato, igual ao
 * tratamento já dado a `/templates/<slug>`; não confirma que o kit/
 * template existe de verdade, só que não é um valor adulterado). Qualquer
 * outro valor (URL externa, protocolo, `//host` de redirecionamento
 * aberto, path adulterado) cai no default `/conta`. Usada tanto por
 * Server Actions (a partir de `FormData`) quanto pelo Route Handler de
 * confirmação de e-mail (a partir de `URLSearchParams`) — por isso
 * recebe só a string já extraída, nunca o objeto de origem.
 */
export function resolveSafeNextPath(
  value: FormDataEntryValue | string | null | undefined,
): string {
  const next = typeof value === "string" ? value : "";
  if (next === "/conta" || next === "/atualizar-senha") return next;
  const match = /^\/(templates|kits)\/([a-z0-9-]+)$/.exec(next);
  if (match && isValidSlug(match[2])) return next;
  return "/conta";
}
