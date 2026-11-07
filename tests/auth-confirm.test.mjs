// Testes isolados de GET /auth/confirm (src/app/auth/confirm/route.ts) —
// o callback que troca o código PKCE (enviado pelo Supabase depois de
// verificar o link de confirmação/recuperação) por uma sessão real.
// Só @/lib/supabase/server é substituído por um fake; resolveSafeNextPath
// (@/lib/safe-next-path + @/lib/slug) é a implementação real, compilada
// junto — mesmo padrão de auth-actions.test.mjs.

import test from "node:test";
import assert from "node:assert/strict";
import {
  compile,
  injectFakeModule,
  clearModuleCache,
  requireCompiled,
} from "./helpers/compile.mjs";

const ROUTE_ENTRY = "src/app/auth/confirm/route.ts";

compile([ROUTE_ENTRY, "src/lib/safe-next-path.ts", "src/lib/slug.ts"]);

function loadRouteWith({ exchangeCodeForSession } = {}) {
  clearModuleCache();
  const calls = { exchangeCodeForSession: [] };

  injectFakeModule("lib/supabase/server", {
    async createClient() {
      return {
        auth: {
          async exchangeCodeForSession(code) {
            calls.exchangeCodeForSession.push(code);
            if (!exchangeCodeForSession) {
              throw new Error("exchangeCodeForSession não deveria ser chamado neste teste");
            }
            return exchangeCodeForSession(code);
          },
        },
      };
    },
  });

  return { mod: requireCompiled(ROUTE_ENTRY), calls };
}

function makeRequest(search) {
  return new Request(`http://localhost/auth/confirm${search}`);
}

async function callRoute(mod, search) {
  const res = await mod.GET(makeRequest(search));
  return { status: res.status, location: res.headers.get("location") };
}

test("código válido -> troca por sessão e redireciona para o next (default /conta)", async () => {
  const { mod, calls } = loadRouteWith({ exchangeCodeForSession: async () => ({ error: null }) });
  const { status, location } = await callRoute(mod, "?code=abc123");
  assert.equal(status, 307);
  assert.equal(location, "http://localhost/conta");
  assert.deepEqual(calls.exchangeCodeForSession, ["abc123"]);
});

test("código válido com next seguro (/atualizar-senha) -> redireciona para lá", async () => {
  const { mod } = loadRouteWith({ exchangeCodeForSession: async () => ({ error: null }) });
  const { location } = await callRoute(mod, "?code=abc123&next=%2Fatualizar-senha");
  assert.equal(location, "http://localhost/atualizar-senha");
});

test("next inseguro (URL externa) cai no default /conta mesmo com código válido", async () => {
  const { mod } = loadRouteWith({ exchangeCodeForSession: async () => ({ error: null }) });
  const { location } = await callRoute(mod, "?code=abc123&next=https%3A%2F%2Fevil.example.com");
  assert.equal(location, "http://localhost/conta");
});

test("código ausente -> redireciona para /login, nunca chama exchangeCodeForSession", async () => {
  const { mod, calls } = loadRouteWith({});
  const { status, location } = await callRoute(mod, "");
  assert.equal(status, 307);
  assert.equal(location, "http://localhost/login?next=%2Fconta");
  assert.equal(calls.exchangeCodeForSession.length, 0);
});

test("código ausente, mas com next seguro -> preserva o next no redirect para /login", async () => {
  const { mod } = loadRouteWith({});
  const { location } = await callRoute(mod, "?next=%2Ftemplates%2Ftemplate51");
  assert.equal(location, "http://localhost/login?next=%2Ftemplates%2Ftemplate51");
});

test("erro na troca do código (expirado/inválido) -> redireciona para /login, nunca finge sucesso", async () => {
  const { mod } = loadRouteWith({
    exchangeCodeForSession: async () => ({ error: { code: "otp_expired", name: "AuthApiError" } }),
  });
  const { status, location } = await callRoute(mod, "?code=expirado");
  assert.equal(status, 307);
  assert.equal(location, "http://localhost/login?next=%2Fconta");
});

test("erro na troca do código com next seguro -> preserva o next mesmo na falha", async () => {
  const { mod } = loadRouteWith({
    exchangeCodeForSession: async () => ({ error: { code: "otp_expired", name: "AuthApiError" } }),
  });
  const { location } = await callRoute(mod, "?code=expirado&next=%2Fatualizar-senha");
  assert.equal(location, "http://localhost/login?next=%2Fatualizar-senha");
});
