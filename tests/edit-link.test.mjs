// Testes isolados da rota GET /api/templates/[slug]/edit-link.
// Nunca toca Supabase, Canva ou rede real — os três módulos de I/O
// (@/lib/supabase/server, @/lib/server/supabase-admin,
// @/lib/server/rate-limit) são substituídos por fakes em memória antes
// de a rota real (compilada do .ts verdadeiro) ser carregada. Nenhum
// link ou identificador real do Canva é usado em nenhum momento — só
// valores sintéticos criados aqui mesmo para o teste.

import test from "node:test";
import assert from "node:assert/strict";
import {
  compile,
  injectFakeModule,
  clearModuleCache,
  requireCompiled,
} from "./helpers/compile.mjs";

const ROUTE_ENTRY = "src/app/api/templates/[slug]/edit-link/route.ts";
const SYNTHETIC_LINK = "https://example-test.invalid/not-a-real-canva-link/abc123";

compile([ROUTE_ENTRY, "src/lib/slug.ts"]);

function loadRouteWith({ claims, profile, profileError, template, templateError, adminAvailable = true }) {
  clearModuleCache();

  injectFakeModule("lib/supabase/server", {
    async createClient() {
      return {
        auth: {
          async getClaims() {
            if (!claims) return { data: null, error: { message: "no session" } };
            return { data: { claims }, error: null };
          },
        },
        from(table) {
          assert.equal(table, "profiles", "a rota só deve consultar 'profiles' pelo client de sessão");
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            async maybeSingle() {
              if (profileError) return { data: null, error: profileError };
              return { data: profile, error: null };
            },
          };
        },
      };
    },
  });

  let adminTemplatesQueried = false;
  injectFakeModule("lib/server/supabase-admin", {
    createAdminClient() {
      if (!adminAvailable) return null;
      return {
        from(table) {
          assert.equal(table, "templates", "o client admin só deve consultar 'templates'");
          adminTemplatesQueried = true;
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            async maybeSingle() {
              if (templateError) return { data: null, error: templateError };
              return { data: template, error: null };
            },
          };
        },
      };
    },
  });

  injectFakeModule("lib/server/rate-limit", {
    checkRateLimit() {
      return { limited: false };
    },
  });

  const mod = requireCompiled(ROUTE_ENTRY);
  return { mod, getAdminTemplatesQueried: () => adminTemplatesQueried };
}

function makeRequest() {
  return new Request("http://localhost/api/templates/template51/edit-link");
}

async function callRoute(mod, slug = "template51") {
  const res = await mod.GET(makeRequest(), { params: Promise.resolve({ slug }) });
  const body = await res.json();
  return { status: res.status, body, cacheControl: res.headers.get("Cache-Control") };
}

test("visitante sem sessão recebe 401 e nenhum editLink", async () => {
  const { mod, getAdminTemplatesQueried } = loadRouteWith({ claims: null });
  const { status, body, cacheControl } = await callRoute(mod);
  assert.equal(status, 401);
  assert.equal(body.error, "unauthenticated");
  assert.equal("editLink" in body, false);
  assert.equal(cacheControl, "private, no-store");
  assert.equal(getAdminTemplatesQueried(), false, "nunca deve consultar templates sem sessão");
});

test("usuário autenticado sem acesso pago recebe 403 e nenhum editLink; templates nunca é consultado", async () => {
  const { mod, getAdminTemplatesQueried } = loadRouteWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: false },
  });
  const { status, body } = await callRoute(mod);
  assert.equal(status, 403);
  assert.equal(body.error, "access_denied");
  assert.equal("editLink" in body, false);
  assert.equal(
    getAdminTemplatesQueried(),
    false,
    "a checagem de has_paid_access deve acontecer ANTES de qualquer consulta a templates",
  );
});

test("falha ao ler profiles também nega acesso (fail closed), nunca concede por omissão", async () => {
  const { mod } = loadRouteWith({
    claims: { sub: "user-123" },
    profileError: { code: "boom" },
  });
  const { status, body } = await callRoute(mod);
  assert.equal(status, 403);
  assert.equal(body.error, "access_denied");
});

test("usuário com acesso pago recebe o link (sintético) só quando configurado", async () => {
  const { mod } = loadRouteWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    template: { canva_editable_url: SYNTHETIC_LINK },
  });
  const { status, body, cacheControl } = await callRoute(mod);
  assert.equal(status, 200);
  assert.equal(body.editLink, SYNTHETIC_LINK);
  assert.equal(Object.keys(body).length, 1, "a resposta não deve conter nenhum campo além de editLink");
  assert.equal(cacheControl, "private, no-store");
});

test("acesso pago mas link ainda não configurado -> 404, nunca inventa um valor", async () => {
  const { mod } = loadRouteWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    template: { canva_editable_url: null },
  });
  const { status, body } = await callRoute(mod);
  assert.equal(status, 404);
  assert.equal(body.error, "link_not_available");
  assert.equal("editLink" in body, false);
});

test("admin client indisponível (sem service_role) -> 501, nunca finge sucesso", async () => {
  const { mod } = loadRouteWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    adminAvailable: false,
  });
  const { status, body } = await callRoute(mod);
  assert.equal(status, 501);
  assert.equal(body.error, "edit_link_not_configured");
});

test("slug mal formado -> 400, antes de qualquer checagem de sessão", async () => {
  const { mod } = loadRouteWith({ claims: null });
  const { status, body } = await callRoute(mod, "../etc/passwd");
  assert.equal(status, 400);
  assert.equal(body.error, "invalid_slug");
});
