// Testes isolados de src/proxy.ts (renovação de sessão + proteção de
// /conta). Diferente dos outros testes de autenticação, proxy.ts importa
// `createServerClient` diretamente de "@supabase/ssr" (pacote externo
// real), não de "@/lib/supabase/server" — por isso usa
// injectFakeNodeModule em vez de injectFakeModule. `NextRequest`/
// `NextResponse` são os reais de "next/server": nunca mockados, só
// construídos com valores sintéticos.

import test from "node:test";
import assert from "node:assert/strict";
// Node ESM exige o caminho exato — "next/server" sem extensão não
// resolve aqui porque o package.json do Next não declara "exports" (só
// "main"); CommonJS (como o código compilado da própria rota) resolve
// "next/server" normalmente, sem essa exigência.
import { NextRequest } from "next/server.js";
import {
  compile,
  injectFakeNodeModule,
  clearModuleCache,
  requireCompiled,
} from "./helpers/compile.mjs";

const PROXY_ENTRY = "src/proxy.ts";

compile([PROXY_ENTRY]);

const ORIGINAL_ENV = { ...process.env };
function restoreEnv() {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
}
test.after(() => restoreEnv());

function setSyntheticEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-anon-key-unit-test-only";
}

function clearSupabaseEnv() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

/**
 * @param getClaimsResult o que o client fake deve devolver de getClaims()
 * @param setAllDuringGetClaims cookies sintéticos que o fake "renova"
 *   (simula o @supabase/ssr real chamando cookies.setAll internamente,
 *   ao atualizar um token) ANTES de resolver getClaims — só assim dá pra
 *   testar que proxy.ts devolve o `supabaseResponse` já mutado, nunca um
 *   NextResponse.next() novo por cima.
 */
function loadProxyWith({ getClaimsResult, setAllDuringGetClaims } = {}) {
  clearModuleCache();
  let createServerClientCalled = false;
  let getClaimsCalled = false;

  injectFakeNodeModule("@supabase/ssr", {
    createServerClient(_url, _key, options) {
      createServerClientCalled = true;
      return {
        auth: {
          async getClaims() {
            getClaimsCalled = true;
            if (setAllDuringGetClaims) {
              options.cookies.setAll(setAllDuringGetClaims);
            }
            return getClaimsResult ?? { data: null, error: { message: "no session" } };
          },
        },
      };
    },
  });

  return {
    mod: requireCompiled(PROXY_ENTRY),
    wasCreateServerClientCalled: () => createServerClientCalled,
    wasGetClaimsCalled: () => getClaimsCalled,
  };
}

function isRedirect(res) {
  return res.status >= 300 && res.status < 400 && res.headers.get("location") !== null;
}

// ---------- PROTEÇÃO DE /conta ----------

test("/conta sem sessão -> redireciona para /login", async () => {
  setSyntheticEnv();
  const { mod } = loadProxyWith({ getClaimsResult: { data: null, error: null } });
  const res = await mod.proxy(new NextRequest("http://localhost/conta"));
  assert.ok(isRedirect(res), "esperava um redirect");
  assert.equal(new URL(res.headers.get("location")).pathname, "/login");
});

test("/conta com sessão válida (claims presentes) -> não redireciona", async () => {
  setSyntheticEnv();
  const { mod } = loadProxyWith({ getClaimsResult: { data: { claims: { sub: "user-123" } }, error: null } });
  const res = await mod.proxy(new NextRequest("http://localhost/conta"));
  assert.equal(isRedirect(res), false, "usuário com sessão nunca deve ser redirecionado para /login");
});

test("rota pública (/) sem sessão -> não redireciona (proxy só protege /conta)", async () => {
  setSyntheticEnv();
  const { mod } = loadProxyWith({ getClaimsResult: { data: null, error: null } });
  const res = await mod.proxy(new NextRequest("http://localhost/"));
  assert.equal(isRedirect(res), false);
});

test("/conta/alguma-subrota também é protegida (prefixo, não só o caminho exato)", async () => {
  setSyntheticEnv();
  const { mod } = loadProxyWith({ getClaimsResult: { data: null, error: null } });
  const res = await mod.proxy(new NextRequest("http://localhost/conta/qualquer-coisa"));
  assert.ok(isRedirect(res));
});

// ---------- JWT INVÁLIDO/EXPIRADO ----------

test("JWT inválido/expirado (getClaims retorna erro) em /conta -> tratado igual a 'sem sessão' (fail-closed)", async () => {
  setSyntheticEnv();
  const { mod } = loadProxyWith({
    getClaimsResult: { data: null, error: { message: "invalid JWT: token is expired" } },
  });
  const res = await mod.proxy(new NextRequest("http://localhost/conta"));
  assert.ok(isRedirect(res));
  assert.equal(new URL(res.headers.get("location")).pathname, "/login");
});

test("claims presente mas data.claims ausente (formato inesperado) -> tratado como sem sessão", async () => {
  setSyntheticEnv();
  const { mod } = loadProxyWith({ getClaimsResult: { data: {}, error: null } });
  const res = await mod.proxy(new NextRequest("http://localhost/conta"));
  assert.ok(isRedirect(res));
});

// ---------- VARIÁVEIS DE AMBIENTE AUSENTES ----------

test("sem NEXT_PUBLIC_SUPABASE_URL/ANON_KEY -> segue sem renovar sessão, nunca lança, nunca chama getClaims", async () => {
  clearSupabaseEnv();
  const { mod, wasCreateServerClientCalled, wasGetClaimsCalled } = loadProxyWith({});
  const res = await mod.proxy(new NextRequest("http://localhost/conta"));
  assert.equal(isRedirect(res), false, "sem credenciais, o proxy não deve nem tentar proteger /conta");
  assert.equal(wasCreateServerClientCalled(), false);
  assert.equal(wasGetClaimsCalled(), false);
});

// ---------- RENOVAÇÃO DE SESSÃO ----------

test("renovação: cookies definidos via setAll durante getClaims chegam na resposta final (não um NextResponse.next() novo por cima)", async () => {
  setSyntheticEnv();
  const { mod } = loadProxyWith({
    getClaimsResult: { data: { claims: { sub: "user-123" } }, error: null },
    setAllDuringGetClaims: [
      { name: "sb-access-token", value: "renewed-token-value", options: { path: "/" } },
    ],
  });
  const res = await mod.proxy(new NextRequest("http://localhost/"));
  assert.equal(res.cookies.get("sb-access-token")?.value, "renewed-token-value");
});

test("renovação: sem nenhum setAll chamado, a resposta ainda é válida e passa adiante", async () => {
  setSyntheticEnv();
  const { mod } = loadProxyWith({ getClaimsResult: { data: { claims: { sub: "user-123" } }, error: null } });
  const res = await mod.proxy(new NextRequest("http://localhost/kits"));
  assert.equal(isRedirect(res), false);
  assert.equal(res.cookies.get("sb-access-token"), undefined);
});
