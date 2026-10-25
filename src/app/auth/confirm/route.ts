import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveSafeNextPath } from "@/lib/safe-next-path";

/**
 * Callback de confirmação de e-mail do cadastro — destino do
 * `emailRedirectTo` passado em `signUp()` (src/app/(auth)/actions.ts).
 * O Supabase já verificou o token no seu próprio link hospedado antes
 * de redirecionar pra cá com `?code=...` (fluxo PKCE, padrão do
 * `@supabase/ssr`); esta rota só troca esse código de uso único por uma
 * sessão real — grava os cookies de sessão pelo client de servidor,
 * mesma peça usada em todo o resto da autenticação — e então manda a
 * pessoa pro destino original.
 *
 * `next` chega aqui vindo da URL (controlada pelo navegador, nunca
 * confiável por si só) — por isso passa de novo por
 * `resolveSafeNextPath` antes de ser usado, a mesma allowlist do login/
 * cadastro. Em qualquer falha (sem `code`, código inválido/expirado),
 * cai pro login preservando o mesmo `next` já sanitizado — nunca pro
 * destino direto sem sessão, e nunca finge sucesso.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = resolveSafeNextPath(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(nextPath)}`, request.url),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Nunca loga o código nem o corpo do erro — só confirma que falhou.
    console.error("auth/confirm: falha ao trocar código por sessão", error.code ?? error.name);
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(nextPath)}`, request.url),
    );
  }

  return NextResponse.redirect(new URL(nextPath, request.url));
}
