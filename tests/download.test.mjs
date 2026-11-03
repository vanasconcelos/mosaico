// Testes isolados da rota GET /api/templates/[slug]/download.
// Mesmo padrão de edit-link.test.mjs: nunca toca Supabase, Storage ou
// rede real — @/lib/supabase/server, @/lib/server/supabase-admin e
// @/lib/server/rate-limit são substituídos por fakes em memória antes
// de a rota real (compilada do .ts verdadeiro) ser carregada. JSZip é a
// dependência REAL (não mockada) — os testes de sucesso descompactam a
// resposta de verdade para confirmar que o .zip gerado é válido e
// contém exatamente os arquivos esperados, não só que "uma resposta
// qualquer" voltou.
//
// Diferença relevante em relação a edit-link/route.ts: esta rota nunca
// consulta a tabela `templates` (só o bucket de Storage, por convenção
// de caminho `templates/<slug>`) e nunca gera signed URL — ela baixa os
// bytes no servidor e monta o .zip ali mesmo. "Falha ao gerar URL
// assinada" e "expiração da URL assinada" (pedidos no escopo da Etapa
// 2.2B) não se aplicam a esta rota — são cobertos em
// templates-page.test.mjs, que exercita a galeria paga (que sim gera
// signed URLs). O equivalente real aqui, coberto abaixo, é a falha ao
// listar ou ao baixar um objeto específico do bucket.

import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  compile,
  injectFakeModule,
  clearModuleCache,
  requireCompiled,
} from "./helpers/compile.mjs";

const ROUTE_ENTRY = "src/app/api/templates/[slug]/download/route.ts";

compile([ROUTE_ENTRY, "src/lib/slug.ts"]);

function loadRouteWith({
  claims,
  claimsError,
  rateLimited = false,
  profile,
  profileError,
  adminAvailable = true,
  listResult,
  downloadResultFor,
  // Atraso artificial (ms) antes de cada download fake resolver — default
  // 0 preserva o comportamento de todos os testes já existentes acima
  // (resolução síncrona de fato). Só usado pelos testes de concorrência
  // em lote abaixo: sem um atraso real, chamadas "paralelas" resolveriam
  // rápido demais pra alguma vez coexistirem de verdade, e o pico de
  // concorrência medido (`calls.maxConcurrentDownloads`) nunca passaria
  // de 1 mesmo que o código não limitasse nada.
  downloadDelayMs = 0,
}) {
  clearModuleCache();
  const calls = {
    profilesQueried: false,
    bucketListed: false,
    objectsDownloaded: [],
    concurrentDownloads: 0,
    maxConcurrentDownloads: 0,
  };

  injectFakeModule("lib/supabase/server", {
    async createClient() {
      return {
        auth: {
          async getClaims() {
            if (claimsError) return { data: null, error: claimsError };
            if (!claims) return { data: null, error: null };
            return { data: { claims }, error: null };
          },
        },
        from(table) {
          assert.equal(table, "profiles", "a rota só deve consultar 'profiles' pelo client de sessão");
          calls.profilesQueried = true;
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

  injectFakeModule("lib/server/supabase-admin", {
    createAdminClient() {
      if (!adminAvailable) return null;
      return {
        storage: {
          from(bucket) {
            assert.equal(bucket, "template-assets");
            return {
              async list(folder) {
                calls.bucketListed = true;
                calls.lastFolder = folder;
                if (!listResult) return { data: [], error: null };
                return listResult;
              },
              async download(path) {
                calls.objectsDownloaded.push(path);
                calls.concurrentDownloads += 1;
                calls.maxConcurrentDownloads = Math.max(
                  calls.maxConcurrentDownloads,
                  calls.concurrentDownloads,
                );
                if (downloadDelayMs > 0) {
                  await new Promise((resolve) => setTimeout(resolve, downloadDelayMs));
                }
                calls.concurrentDownloads -= 1;
                const result = downloadResultFor ? downloadResultFor(path) : null;
                if (!result) {
                  return { data: new Blob([new Uint8Array([1, 2, 3])]), error: null };
                }
                return result;
              },
            };
          },
        },
      };
    },
  });

  injectFakeModule("lib/server/rate-limit", {
    checkRateLimit() {
      return rateLimited ? { limited: true, retryAfterSeconds: 42 } : { limited: false };
    },
  });

  return { mod: requireCompiled(ROUTE_ENTRY), calls };
}

function makeRequest() {
  return new Request("http://localhost/api/templates/template51/download");
}

async function callRoute(mod, slug = "template51") {
  const res = await mod.GET(makeRequest(), { params: Promise.resolve({ slug }) });
  return res;
}

async function callRouteJson(mod, slug = "template51") {
  const res = await callRoute(mod, slug);
  const body = await res.json();
  return { status: res.status, body, cacheControl: res.headers.get("Cache-Control") };
}

// ---------- SLUG INEXISTENTE / INVÁLIDO ----------

test("slug mal formado -> 400, antes de qualquer checagem de sessão ou acesso ao bucket", async () => {
  const { mod, calls } = loadRouteWith({ claims: null });
  const { status, body, cacheControl } = await callRouteJson(mod, "../../etc/passwd");
  assert.equal(status, 400);
  assert.equal(body.error, "invalid_slug");
  assert.equal(cacheControl, "private, no-store");
  assert.equal(calls.profilesQueried, false);
  assert.equal(calls.bucketListed, false);
});

// ---------- SESSÃO ----------

test("visitante sem sessão -> 401, nunca consulta perfil nem bucket", async () => {
  const { mod, calls } = loadRouteWith({ claims: null });
  const { status, body, cacheControl } = await callRouteJson(mod);
  assert.equal(status, 401);
  assert.equal(body.error, "unauthenticated");
  assert.equal(cacheControl, "private, no-store");
  assert.equal(calls.profilesQueried, false);
  assert.equal(calls.bucketListed, false);
});

test("sessão inválida (getClaims retorna erro, ex.: JWT expirado) -> 401, tratado igual a 'sem sessão'", async () => {
  const { mod, calls } = loadRouteWith({ claimsError: { message: "invalid JWT" } });
  const { status, body } = await callRouteJson(mod);
  assert.equal(status, 401);
  assert.equal(body.error, "unauthenticated");
  assert.equal(calls.profilesQueried, false);
});

// ---------- RATE LIMIT ----------

test("limite de requisições excedido -> 429 com Retry-After, antes de consultar o perfil", async () => {
  const { mod, calls } = loadRouteWith({ claims: { sub: "user-123" }, rateLimited: true });
  const res = await callRoute(mod);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("Retry-After"), "42");
  assert.equal(res.headers.get("Cache-Control"), "private, no-store");
  const body = await res.json();
  assert.equal(body.error, "too_many_requests");
  assert.equal(calls.profilesQueried, false);
});

// ---------- has_paid_access ----------

test("usuário autenticado sem has_paid_access -> 403, nunca toca o bucket", async () => {
  const { mod, calls } = loadRouteWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: false },
  });
  const { status, body } = await callRouteJson(mod);
  assert.equal(status, 403);
  assert.equal(body.error, "access_denied");
  assert.equal(calls.bucketListed, false);
});

test("falha ao consultar o perfil -> 403 (fail closed), nunca concede por omissão", async () => {
  const { mod, calls } = loadRouteWith({
    claims: { sub: "user-123" },
    profileError: { code: "boom" },
  });
  const { status, body } = await callRouteJson(mod);
  assert.equal(status, 403);
  assert.equal(body.error, "access_denied");
  assert.equal(calls.bucketListed, false);
});

// ---------- ADMIN/STORAGE INDISPONÍVEL ----------

test("client admin indisponível (sem service_role) -> 501, nunca finge sucesso", async () => {
  const { mod } = loadRouteWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    adminAvailable: false,
  });
  const { status, body } = await callRouteJson(mod);
  assert.equal(status, 501);
  assert.equal(body.error, "download_not_configured");
});

test("falha ao listar o bucket (equivalente a 'falha ao consultar o conteúdo') -> 500, mensagem genérica, nunca expõe o erro interno", async () => {
  const { mod } = loadRouteWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    listResult: { data: null, error: { message: "connection reset by peer, bucket=template-assets, internal-id=xyz" } },
  });
  const { status, body } = await callRouteJson(mod);
  assert.equal(status, 500);
  assert.equal(body.error, "lookup_failed");
  assert.equal(JSON.stringify(body).includes("internal-id"), false, "nunca deve vazar detalhe do erro interno do Storage");
});

// ---------- ARQUIVO INEXISTENTE ----------

test("pasta vazia no bucket (template sem arquivos cadastrados) -> 404, nunca gera zip vazio", async () => {
  const { mod, calls } = loadRouteWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    listResult: { data: [], error: null },
  });
  const { status, body } = await callRouteJson(mod);
  assert.equal(status, 404);
  assert.equal(body.error, "content_not_available");
  assert.equal(calls.lastFolder, "templates/template51");
});

// ---------- FALHA AO BAIXAR UM OBJETO ESPECÍFICO ----------

test("falha ao baixar um objeto específico do bucket -> 500, nunca entrega um zip parcial", async () => {
  const { mod, calls } = loadRouteWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    listResult: { data: [{ name: "slide01.png" }, { name: "slide02.png" }], error: null },
    downloadResultFor: (path) =>
      path.endsWith("slide02.png") ? { data: null, error: { message: "object not found, key=abc123" } } : null,
  });
  const res = await callRoute(mod);
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.error, "lookup_failed");
  assert.equal(JSON.stringify(body).includes("abc123"), false, "nunca deve vazar a chave/caminho interno do objeto");
  // Confirma que não houve tentativa de montar resposta parcial: só os
  // dois arquivos esperados foram tentados, nenhum a mais.
  assert.deepEqual(calls.objectsDownloaded, [
    "templates/template51/slide01.png",
    "templates/template51/slide02.png",
  ]);
});

// ---------- RESPOSTA DE DOWNLOAD VÁLIDA ----------

test("usuário com acesso pago recebe um .zip válido, com os arquivos certos, em ordem estável", async () => {
  const conteudoPorArquivo = {
    "slide02.png": new Uint8Array([10, 20, 30]),
    "slide01.png": new Uint8Array([1, 2, 3]),
  };
  const { mod } = loadRouteWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    // Propositalmente fora de ordem na listagem — a rota deve reordenar.
    listResult: { data: [{ name: "slide02.png" }, { name: "slide01.png" }], error: null },
    downloadResultFor: (path) => {
      const name = path.split("/").pop();
      return { data: new Blob([conteudoPorArquivo[name]]), error: null };
    },
  });

  const res = await callRoute(mod);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "application/zip");
  assert.equal(res.headers.get("Content-Disposition"), 'attachment; filename="template51.zip"');
  assert.equal(res.headers.get("Cache-Control"), "private, no-store");

  const zipBytes = Buffer.from(await res.arrayBuffer());
  const zip = await JSZip.loadAsync(zipBytes);
  const nomes = Object.keys(zip.files).sort();
  assert.deepEqual(nomes, ["slide01.png", "slide02.png"]);

  const slide01 = await zip.files["slide01.png"].async("uint8array");
  assert.deepEqual([...slide01], [1, 2, 3]);
  const slide02 = await zip.files["slide02.png"].async("uint8array");
  assert.deepEqual([...slide02], [10, 20, 30]);
});

test("nenhuma resposta de erro expõe o caminho interno do bucket ou o slug fora do esperado", async () => {
  const { mod } = loadRouteWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: false },
  });
  const res = await callRoute(mod);
  const bodyText = await res.text();
  assert.equal(bodyText.includes("template-assets"), false);
  assert.equal(bodyText.includes("templates/"), false);
});

// ---------- CONCORRÊNCIA EM LOTES (Fase 4.11, item 3) ----------

function makeSlides(count) {
  return Array.from({ length: count }, (_, i) => ({
    name: `slide${String(i + 1).padStart(2, "0")}.png`,
  }));
}

test("baixa no máximo 4 arquivos em paralelo por vez, nunca o template inteiro de uma vez", async () => {
  const { mod, calls } = loadRouteWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    listResult: { data: makeSlides(9), error: null },
    // Atraso real — sem ele, chamadas "paralelas" resolveriam rápido
    // demais pra coexistir de verdade (ver comentário em loadRouteWith).
    downloadDelayMs: 20,
  });

  const res = await callRoute(mod);
  assert.equal(res.status, 200);
  // 9 arquivos em lotes de 4 -> picos de 4, 4 e 1. Nunca mais que 4 ao
  // mesmo tempo (o próprio objetivo desta fase), mas também nunca travado
  // em 1 por vez (confirmaria que a mudança não teve efeito nenhum).
  assert.equal(calls.maxConcurrentDownloads, 4);
  assert.equal(calls.objectsDownloaded.length, 9);
});

test("preserva a ordem e o conteúdo de cada arquivo no .zip mesmo baixando em lotes paralelos", async () => {
  const conteudoPorArquivo = Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => [
      `slide${String(i + 1).padStart(2, "0")}.png`,
      new Uint8Array([i + 1, i + 1, i + 1]),
    ]),
  );
  const { mod } = loadRouteWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    // Fora de ordem na listagem, igual ao teste de 2 arquivos acima — a
    // rota deve reordenar antes de montar os lotes.
    listResult: { data: [...makeSlides(9)].reverse(), error: null },
    downloadDelayMs: 10,
    downloadResultFor: (path) => {
      const name = path.split("/").pop();
      return { data: new Blob([conteudoPorArquivo[name]]), error: null };
    },
  });

  const res = await callRoute(mod);
  assert.equal(res.status, 200);
  const zipBytes = Buffer.from(await res.arrayBuffer());
  const zip = await JSZip.loadAsync(zipBytes);
  assert.deepEqual(Object.keys(zip.files).sort(), Object.keys(conteudoPorArquivo).sort());

  for (const [name, esperado] of Object.entries(conteudoPorArquivo)) {
    const bytes = await zip.files[name].async("uint8array");
    assert.deepEqual([...bytes], [...esperado], `conteúdo de ${name} não deveria ter trocado entre lotes`);
  }
});

test("falha num arquivo do SEGUNDO lote -> 500, nunca entrega zip parcial, nunca inicia o lote seguinte", async () => {
  const { mod, calls } = loadRouteWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    // 9 arquivos -> lotes [1-4], [5-8], [9]. Falha em slide06 (2º arquivo
    // do segundo lote).
    listResult: { data: makeSlides(9), error: null },
    downloadDelayMs: 10,
    downloadResultFor: (path) =>
      path.endsWith("slide06.png") ? { data: null, error: { message: "object not found, key=zzz" } } : null,
  });

  const res = await callRoute(mod);
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.error, "lookup_failed");
  assert.equal(JSON.stringify(body).includes("zzz"), false);

  // O 1º lote (4) e o 2º lote (4, incluindo o que falhou) são sempre
  // totalmente tentados — `Promise.all` espera todo o lote antes de
  // checar erros. O 3º lote (slide09) nunca deveria começar.
  assert.equal(calls.objectsDownloaded.length, 8);
  assert.equal(calls.objectsDownloaded.includes("templates/template51/slide09.png"), false);
});
