"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveSafeNextPath } from "@/lib/safe-next-path";

/**
 * Server Actions de autenticação — rodam no servidor, os cookies de
 * sessão são escritos corretamente aqui (diferente de um Server
 * Component, onde a escrita falha silenciosamente — ver o comentário
 * em src/lib/supabase/server.ts). Nunca expõem a senha nem o token de
 * volta ao formulário — só uma mensagem de erro genérica.
 */

export type AuthActionState = { error: string | null };
export type RecuperarSenhaState = { error: string | null; sent: boolean };

function readEmailSenha(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  return { email, senha };
}

export async function cadastrarAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const { email, senha } = readEmailSenha(formData);
  if (!email || !senha) {
    return { error: "Preencha e-mail e senha." };
  }

  const nextPath = resolveSafeNextPath(formData.get("next"));

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: senha,
    options: {
      // O próprio `next` (já sanitizado acima, nunca o valor cru) vai
      // de volta pro link de confirmação — o Supabase anexa `?code=...`
      // a esta URL depois de verificar o token e redireciona pra cá. O
      // Route Handler em src/app/auth/confirm/route.ts troca esse código
      // por uma sessão de verdade e revalida `next` de novo antes de
      // decidir pra onde ir — nunca confia duas vezes no mesmo valor sem
      // checar. Nenhum segredo/token/dado pessoal entra nesta URL, só um
      // caminho interno já restrito à allowlist.
      emailRedirectTo: `${siteUrl}/auth/confirm?next=${encodeURIComponent(nextPath)}`,
    },
  });
  if (error) {
    // Antes não logava nada aqui — igual era o caso do login antes do
    // ajuste anterior. Só os três campos técnicos explícitos, nunca o
    // objeto de erro inteiro (poderia trazer e-mail ou outro detalhe em
    // alguma versão futura do SDK) — mesmo padrão já usado em
    // loginAction/recuperarSenhaAction. Um só log aqui, não duplicado
    // em nenhum outro lugar do fluxo de cadastro.
    console.error("[cadastro] erro do Supabase Auth", {
      code: error.code,
      name: error.name,
      status: error.status,
    });
    // error.code (ex.: "user_already_exists") é estável e não sensível —
    // nunca error.message aqui, pode variar e detalhar demais.
    return { error: error.code ?? error.name };
  }

  // Com "Confirm email" ativado (confirmado neste projeto), signUp()
  // pra um e-mail que já tem conta NÃO volta erro — a própria
  // documentação do SDK instalado (GoTrueClient.d.ts) descreve isso:
  // "an obfuscated/fake user object is returned", com
  // `identities: []`. Sem esta checagem, a pessoa via "conta criada"
  // mesmo sem nada ter sido criado de verdade. Só trata como esse caso
  // quando `identities` é comprovadamente um array vazio — `undefined`
  // (campo ausente, resposta normal) ou `null` nunca entram aqui,
  // seguem o fluxo normal abaixo.
  if (
    data.user &&
    Array.isArray(data.user.identities) &&
    data.user.identities.length === 0
  ) {
    // Nenhum dado pessoal aqui — só o fato de ter batido nesse caminho,
    // útil pra diagnosticar sem nunca revelar qual e-mail foi usado.
    console.warn(
      "[cadastro] signUp devolveu identidade vazia — provável conta já existente",
    );
    // Mensagem neutra de propósito (nunca confirma nem nega que o
    // e-mail já está cadastrado — evita dar a quem está testando um
    // oráculo de enumeração de contas): mesma cautela já aplicada em
    // recuperarSenhaAction, que também nunca diferencia "e-mail existe"
    // de "e-mail não existe" na resposta.
    return { error: "signup_possibly_existing_account" };
  }

  // Enquanto o e-mail não é confirmado, a pessoa pode voltar a esta
  // mesma aba e logar manualmente — por isso o `next` também segue na
  // query do login, como antes. Se em vez disso ela abrir o link de
  // confirmação (mesma aba ou outra), quem decide o destino final é o
  // callback acima, não este redirect.
  redirect(`/login?cadastro=enviado&next=${encodeURIComponent(nextPath)}`);
}

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const { email, senha } = readEmailSenha(formData);
  if (!email || !senha) {
    return { error: "Preencha e-mail e senha." };
  }

  const nextPath = resolveSafeNextPath(formData.get("next"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (error) {
    // Antes não logava nada aqui — uma falha de login não deixava
    // nenhum rastro pra investigar depois. Só código/nome/status
    // técnicos, nunca e-mail, senha ou o objeto completo do erro, igual
    // ao padrão já usado em recuperarSenhaAction.
    console.error("[login] erro do Supabase Auth", {
      code: error.code,
      name: error.name,
      status: error.status,
    });
    return { error: error.code ?? error.name };
  }

  redirect(nextPath);
}

export async function recuperarSenhaAction(
  _prev: RecuperarSenhaState,
  formData: FormData,
): Promise<RecuperarSenhaState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "Informe o e-mail da sua conta.", sent: false };
  }

  // Antes apontava direto pra `/atualizar-senha`, sem nenhuma troca do
  // código PKCE por sessão no meio do caminho — a página carregava o
  // formulário sem sessão nenhuma. Reaproveita o mesmo callback do
  // cadastro (`/auth/confirm`, já testado e já com a troca de código
  // implementada); `next` é o literal fixo `/atualizar-senha`, aceito só
  // ele nesse formato por `resolveSafeNextPath`.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/confirm?next=${encodeURIComponent("/atualizar-senha")}`,
  });
  if (error) {
    // Diagnóstico temporário — só código/nome/status técnicos do erro do
    // Supabase Auth, nunca e-mail, token, URL ou o objeto completo do erro.
    console.error("[password_recovery] erro do Supabase Auth", {
      op: "password_recovery",
      code: error.code,
      name: error.name,
      status: error.status,
    });
    return { error: error.code ?? error.name, sent: false };
  }

  // Sempre a mesma mensagem, exista ou não a conta — nunca confirmar
  // pra quem está perguntando se um e-mail está cadastrado.
  return { error: null, sent: true };
}

export async function atualizarSenhaAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const novaSenha = String(formData.get("senha") ?? "");
  if (!novaSenha || novaSenha.length < 6) {
    return { error: "A senha precisa ter pelo menos 6 caracteres." };
  }

  const supabase = await createClient();
  // Só funciona dentro da sessão temporária que o link de recuperação
  // cria ao ser aberto — sem isso, getClaims() não acharia sessão
  // nenhuma e updateUser já rejeitaria sozinho.
  const { error } = await supabase.auth.updateUser({ password: novaSenha });
  if (error) {
    return { error: error.code ?? error.name };
  }

  redirect("/login?senha=atualizada");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
