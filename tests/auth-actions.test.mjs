// Testes isolados das Server Actions de autenticação
// (src/app/(auth)/actions.ts). Nunca toca Supabase real — só
// @/lib/supabase/server é substituído por um fake em memória; a lógica
// real de resolveSafeNextPath (@/lib/safe-next-path + @/lib/slug) é
// compilada e exercitada de verdade, igual ao padrão já usado em
// checkout.test.mjs para @/lib/pricing.
//
// `redirect()` de "next/navigation" é a implementação REAL (não
// mockada) — fora do runtime do Next ela lança um Error com
// `error.digest = "NEXT_REDIRECT;<tipo>;<url>;<status>;"` (confirmado
// lendo node_modules/next/dist/client/components/redirect.js). Os
// testes capturam essa exceção e extraem o destino do próprio digest —
// a mesma técnica que next/navigation usa internamente
// (getURLFromRedirectError), sem precisar importar nada interno do Next.

import test from "node:test";
import assert from "node:assert/strict";
import {
  compile,
  injectFakeModule,
  clearModuleCache,
  requireCompiled,
} from "./helpers/compile.mjs";

const ACTIONS_ENTRY = "src/app/(auth)/actions.ts";

compile([ACTIONS_ENTRY, "src/lib/safe-next-path.ts", "src/lib/slug.ts"]);

function redirectTargetOf(error) {
  assert.ok(error && typeof error.digest === "string", "esperava um erro de redirect do next/navigation");
  const parts = error.digest.split(";");
  assert.equal(parts[0], "NEXT_REDIRECT", `esperava NEXT_REDIRECT, recebeu: ${error.digest}`);
  return parts.slice(2, -2).join(";");
}

async function expectRedirect(fn) {
  try {
    await fn();
  } catch (err) {
    return redirectTargetOf(err);
  }
  assert.fail("esperava que a action chamasse redirect()");
}

function formData(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) fd.set(k, v);
  }
  return fd;
}

function loadActionsWith({ signUp, signInWithPassword, resetPasswordForEmail, updateUser, signOut } = {}) {
  clearModuleCache();
  const calls = { signUp: [], signInWithPassword: [], resetPasswordForEmail: [], updateUser: [], signOut: [] };

  injectFakeModule("lib/supabase/server", {
    async createClient() {
      return {
        auth: {
          async signUp(args) {
            calls.signUp.push(args);
            if (!signUp) throw new Error("signUp não deveria ser chamado neste teste");
            return signUp(args);
          },
          async signInWithPassword(args) {
            calls.signInWithPassword.push(args);
            if (!signInWithPassword) throw new Error("signInWithPassword não deveria ser chamado neste teste");
            return signInWithPassword(args);
          },
          async resetPasswordForEmail(email, opts) {
            calls.resetPasswordForEmail.push({ email, opts });
            if (!resetPasswordForEmail) throw new Error("resetPasswordForEmail não deveria ser chamado neste teste");
            return resetPasswordForEmail(email, opts);
          },
          async updateUser(args) {
            calls.updateUser.push(args);
            if (!updateUser) throw new Error("updateUser não deveria ser chamado neste teste");
            return updateUser(args);
          },
          async signOut(args) {
            calls.signOut.push(args);
            if (!signOut) return { error: null };
            return signOut(args);
          },
        },
      };
    },
  });

  return { mod: requireCompiled(ACTIONS_ENTRY), calls };
}

// ---------- CADASTRO ----------

test("cadastro: válido -> redireciona para /login?cadastro=enviado, identities não vazio", async () => {
  const { mod, calls } = loadActionsWith({
    signUp: async () => ({ data: { user: { identities: [{ id: "x" }] } }, error: null }),
  });
  const target = await expectRedirect(() =>
    mod.cadastrarAction({ error: null }, formData({ email: "nova@example.com", senha: "senha123" })),
  );
  assert.equal(target, "/login?cadastro=enviado&next=%2Fconta");
  assert.equal(calls.signUp.length, 1);
  assert.equal(calls.signUp[0].email, "nova@example.com");
  assert.equal(calls.signUp[0].password, "senha123");
  assert.match(calls.signUp[0].options.emailRedirectTo, /\/auth\/confirm\?next=%2Fconta$/);
});

test("cadastro: next seguro (/templates/<slug>) é preservado no link de confirmação e no redirect", async () => {
  const { mod } = loadActionsWith({
    signUp: async () => ({ data: { user: { identities: [{ id: "x" }] } }, error: null }),
  });
  const target = await expectRedirect(() =>
    mod.cadastrarAction(
      { error: null },
      formData({ email: "nova@example.com", senha: "senha123", next: "/templates/template51" }),
    ),
  );
  assert.equal(target, "/login?cadastro=enviado&next=%2Ftemplates%2Ftemplate51");
});

test("cadastro: next inseguro (URL externa) cai no default /conta, nunca é usado cru", async () => {
  const { mod } = loadActionsWith({
    signUp: async () => ({ data: { user: { identities: [{ id: "x" }] } }, error: null }),
  });
  const target = await expectRedirect(() =>
    mod.cadastrarAction(
      { error: null },
      formData({ email: "nova@example.com", senha: "senha123", next: "https://evil.example.com" }),
    ),
  );
  assert.equal(target, "/login?cadastro=enviado&next=%2Fconta");
});

test("cadastro: campos inválidos (e-mail ou senha vazios) -> erro genérico, nunca chama signUp", async () => {
  const { mod, calls } = loadActionsWith({});
  const r1 = await mod.cadastrarAction({ error: null }, formData({ email: "", senha: "senha123" }));
  assert.equal(r1.error, "Preencha e-mail e senha.");
  const r2 = await mod.cadastrarAction({ error: null }, formData({ email: "a@example.com", senha: "" }));
  assert.equal(r2.error, "Preencha e-mail e senha.");
  assert.equal(calls.signUp.length, 0, "signUp nunca deve ser chamado sem os dois campos preenchidos");
});

test("cadastro: e-mail já existente (identities: []) -> mensagem neutra, nunca confirma nem nega a conta", async () => {
  const { mod } = loadActionsWith({
    signUp: async () => ({ data: { user: { identities: [] } }, error: null }),
  });
  const result = await mod.cadastrarAction(
    { error: null },
    formData({ email: "ja-existe@example.com", senha: "senha123" }),
  );
  assert.equal(result.error, "signup_possibly_existing_account");
});

test("cadastro: identities undefined (resposta normal, não ambígua) segue o fluxo de sucesso", async () => {
  const { mod } = loadActionsWith({
    signUp: async () => ({ data: { user: { identities: undefined } }, error: null }),
  });
  const target = await expectRedirect(() =>
    mod.cadastrarAction({ error: null }, formData({ email: "nova@example.com", senha: "senha123" })),
  );
  assert.match(target, /^\/login\?cadastro=enviado/);
});

test("cadastro: erro do Supabase com code -> retorna o code, nunca o objeto completo", async () => {
  const { mod } = loadActionsWith({
    signUp: async () => ({
      data: { user: null },
      error: { code: "user_already_exists", name: "AuthApiError", status: 422 },
    }),
  });
  const result = await mod.cadastrarAction(
    { error: null },
    formData({ email: "repetido@example.com", senha: "senha123" }),
  );
  assert.equal(result.error, "user_already_exists");
});

test("cadastro: erro do Supabase sem code -> usa error.name como fallback", async () => {
  const { mod } = loadActionsWith({
    signUp: async () => ({ data: { user: null }, error: { name: "AuthUnknownError" } }),
  });
  const result = await mod.cadastrarAction(
    { error: null },
    formData({ email: "x@example.com", senha: "senha123" }),
  );
  assert.equal(result.error, "AuthUnknownError");
});

// ---------- LOGIN ----------

test("login: válido -> redireciona para o next (default /conta)", async () => {
  const { mod, calls } = loadActionsWith({
    signInWithPassword: async () => ({ error: null }),
  });
  const target = await expectRedirect(() =>
    mod.loginAction({ error: null }, formData({ email: "a@example.com", senha: "senha123" })),
  );
  assert.equal(target, "/conta");
  assert.equal(calls.signInWithPassword[0].email, "a@example.com");
});

test("login: next seguro preservado no redirect final", async () => {
  const { mod } = loadActionsWith({ signInWithPassword: async () => ({ error: null }) });
  const target = await expectRedirect(() =>
    mod.loginAction({ error: null }, formData({ email: "a@example.com", senha: "senha123", next: "/kits/social-media" })),
  );
  assert.equal(target, "/kits/social-media");
});

test("login: campos vazios -> erro genérico, nunca chama signInWithPassword", async () => {
  const { mod, calls } = loadActionsWith({});
  const result = await mod.loginAction({ error: null }, formData({ email: "a@example.com", senha: "" }));
  assert.equal(result.error, "Preencha e-mail e senha.");
  assert.equal(calls.signInWithPassword.length, 0);
});

test("login: credenciais inválidas -> retorna o code do erro", async () => {
  const { mod } = loadActionsWith({
    signInWithPassword: async () => ({ error: { code: "invalid_credentials", name: "AuthApiError", status: 400 } }),
  });
  const result = await mod.loginAction({ error: null }, formData({ email: "a@example.com", senha: "errada" }));
  assert.equal(result.error, "invalid_credentials");
});

test("login: erro de autenticação sem code -> usa error.name", async () => {
  const { mod } = loadActionsWith({
    signInWithPassword: async () => ({ error: { name: "AuthRetryableFetchError" } }),
  });
  const result = await mod.loginAction({ error: null }, formData({ email: "a@example.com", senha: "x" }));
  assert.equal(result.error, "AuthRetryableFetchError");
});

// ---------- LOGOUT ----------

test("logout: chama signOut com scope local e sempre redireciona para /", async () => {
  const { mod, calls } = loadActionsWith({ signOut: async () => ({ error: null }) });
  const target = await expectRedirect(() => mod.logoutAction());
  assert.equal(target, "/");
  assert.deepEqual(calls.signOut[0], { scope: "local" });
});

test("logout: mesmo se signOut falhar, a action ainda redireciona para / (comportamento atual, documentado — não é um bug corrigido nesta etapa)", async () => {
  const { mod } = loadActionsWith({ signOut: async () => ({ error: { code: "network_error", name: "AuthRetryableFetchError" } }) });
  const target = await expectRedirect(() => mod.logoutAction());
  assert.equal(target, "/", "logoutAction não verifica o retorno de signOut antes de redirecionar");
});

// ---------- RECUPERAÇÃO DE SENHA ----------

test("recuperação: solicitação válida -> { error: null, sent: true }", async () => {
  const { mod, calls } = loadActionsWith({
    resetPasswordForEmail: async () => ({ error: null }),
  });
  const result = await mod.recuperarSenhaAction({ error: null, sent: false }, formData({ email: "existe@example.com" }));
  assert.deepEqual(result, { error: null, sent: true });
  assert.match(calls.resetPasswordForEmail[0].opts.redirectTo, /\/auth\/confirm\?next=%2Fatualizar-senha$/);
});

test("recuperação: resposta é idêntica para e-mail existente e inexistente (sem oráculo de enumeração)", async () => {
  const { mod: modA } = loadActionsWith({ resetPasswordForEmail: async () => ({ error: null }) });
  const resultExistente = await modA.recuperarSenhaAction({ error: null, sent: false }, formData({ email: "existe@example.com" }));

  const { mod: modB } = loadActionsWith({ resetPasswordForEmail: async () => ({ error: null }) });
  const resultInexistente = await modB.recuperarSenhaAction({ error: null, sent: false }, formData({ email: "nao-existe@example.com" }));

  assert.deepEqual(resultExistente, resultInexistente);
});

test("recuperação: e-mail vazio -> erro local, nunca chama resetPasswordForEmail", async () => {
  const { mod, calls } = loadActionsWith({});
  const result = await mod.recuperarSenhaAction({ error: null, sent: false }, formData({ email: "" }));
  assert.equal(result.error, "Informe o e-mail da sua conta.");
  assert.equal(result.sent, false);
  assert.equal(calls.resetPasswordForEmail.length, 0);
});

test("recuperação: erro do Supabase -> sent: false, retorna o code", async () => {
  const { mod } = loadActionsWith({
    resetPasswordForEmail: async () => ({ error: { code: "over_email_send_rate_limit", name: "AuthApiError" } }),
  });
  const result = await mod.recuperarSenhaAction({ error: null, sent: false }, formData({ email: "x@example.com" }));
  assert.deepEqual(result, { error: "over_email_send_rate_limit", sent: false });
});

// ---------- ATUALIZAÇÃO DE SENHA ----------

test("atualização de senha: válida (>= 6 chars) -> redireciona para /login?senha=atualizada", async () => {
  const { mod, calls } = loadActionsWith({ updateUser: async () => ({ error: null }) });
  const target = await expectRedirect(() => mod.atualizarSenhaAction({ error: null }, formData({ senha: "senha123" })));
  assert.equal(target, "/login?senha=atualizada");
  assert.deepEqual(calls.updateUser[0], { password: "senha123" });
});

test("atualização de senha: abaixo do mínimo (5 chars) -> erro local, nunca chama updateUser", async () => {
  const { mod, calls } = loadActionsWith({});
  const result = await mod.atualizarSenhaAction({ error: null }, formData({ senha: "abcde" }));
  assert.equal(result.error, "A senha precisa ter pelo menos 6 caracteres.");
  assert.equal(calls.updateUser.length, 0);
});

test("atualização de senha: vazia -> mesmo erro local, nunca chama updateUser", async () => {
  const { mod, calls } = loadActionsWith({});
  const result = await mod.atualizarSenhaAction({ error: null }, formData({}));
  assert.equal(result.error, "A senha precisa ter pelo menos 6 caracteres.");
  assert.equal(calls.updateUser.length, 0);
});

test("atualização de senha: sessão/token de recuperação inválido -> updateUser retorna erro, action devolve o code", async () => {
  const { mod } = loadActionsWith({
    updateUser: async () => ({ error: { code: "session_not_found", name: "AuthSessionMissingError" } }),
  });
  const result = await mod.atualizarSenhaAction({ error: null }, formData({ senha: "senha123" }));
  assert.equal(result.error, "session_not_found");
});
