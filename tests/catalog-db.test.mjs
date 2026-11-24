// Testes da camada de leitura do catálogo via Supabase
// (src/lib/server/catalog-db.ts) — PREPARADA, ainda não usada por
// nenhuma página real (ver comentário do próprio módulo). Mesmo padrão
// de mock em memória já usado em download.test.mjs/edit-link.test.mjs:
// @/lib/supabase/server é substituído por um fake antes da rota real
// (compilada do .ts verdadeiro) ser carregada — nunca toca rede nem
// Supabase de verdade.

import test from "node:test";
import assert from "node:assert/strict";
import { compile, injectFakeModule, clearModuleCache, requireCompiled } from "./helpers/compile.mjs";

const ENTRY = "src/lib/server/catalog-db.ts";
compile([ENTRY]);

/**
 * Fake mínimo do client supabase-js suficiente para os três métodos
 * usados por catalog-db.ts: `.from(t).select(cols)` (aguardado direto,
 * usado pelas consultas "getAll") e `.from(t).select(cols).eq(c,v).maybeSingle()`
 * (usado pela consulta por slug/id única).
 *
 * Achado da auditoria: a versão anterior deste fake nunca registrava
 * COM QUAIS argumentos `.eq()` era chamado — um bug real no código (ex.:
 * `.eq("title", slug)` em vez de `.eq("slug", slug)`) passaria
 * despercebido por todos os testes. Agora `calls.eqArgs` guarda
 * `{table, column, value}` de cada chamada, pra testes afirmarem sobre
 * isso de verdade, não só sobre o resultado final.
 */
function makeFakeSupabase({
  kitsList = { data: [], error: null },
  templatesPreviewList = { data: [], error: null },
  templatesPreviewSingle = { data: null, error: null },
  kitSingle = { data: null, error: null },
} = {}) {
  const calls = { eqArgs: [] };

  function thenableSelect(result) {
    const promise = Promise.resolve(result);
    return {
      then: promise.then.bind(promise),
      eq(column, value) {
        calls.eqArgs.push({ table: result === templatesPreviewList ? "templates_preview" : "kits", column, value });
        return {
          async maybeSingle() {
            return result === templatesPreviewList ? templatesPreviewSingle : kitSingle;
          },
        };
      },
    };
  }

  const createClient = async function createClient() {
    return {
      from(table) {
        if (table === "kits") {
          return { select: () => thenableSelect(kitsList) };
        }
        if (table === "templates_preview") {
          return { select: () => thenableSelect(templatesPreviewList) };
        }
        throw new Error(`tabela inesperada consultada: ${table}`);
      },
    };
  };
  createClient.calls = calls;
  return createClient;
}

function load(fakeClientFactory) {
  clearModuleCache();
  injectFakeModule("lib/supabase/server", { createClient: fakeClientFactory });
  return requireCompiled(ENTRY);
}

test("getAllKitsFromDb: tabela vazia -> status 'empty', nunca finge ter dados", async () => {
  const { getAllKitsFromDb } = load(makeFakeSupabase({ kitsList: { data: [], error: null } }));
  const result = await getAllKitsFromDb();
  assert.equal(result.status, "empty");
  assert.deepEqual(result.data, []);
});

test("getAllKitsFromDb: erro do banco -> status 'error', com a mensagem, nunca uma lista vazia disfarçada de sucesso", async () => {
  const { getAllKitsFromDb } = load(
    makeFakeSupabase({ kitsList: { data: null, error: { message: "connection refused" } } }),
  );
  const result = await getAllKitsFromDb();
  assert.equal(result.status, "error");
  assert.equal(result.error, "connection refused");
});

test("getAllKitsFromDb: sucesso -> mapeia status 'draft'/'published' corretamente, nunca inventa um terceiro valor", async () => {
  const { getAllKitsFromDb } = load(
    makeFakeSupabase({
      kitsList: {
        data: [
          { id: "k1", slug: "social-media", title: "Social Media", description: "d", status: "draft" },
          { id: "k2", slug: "advogados", title: "Advocacia", description: "d2", status: "published" },
          { id: "k3", slug: "x", title: "X", description: "d3", status: "algo-nao-mapeado" },
        ],
        error: null,
      },
    }),
  );
  const result = await getAllKitsFromDb();
  assert.equal(result.status, "ok");
  assert.equal(result.data[0].status, "draft");
  assert.equal(result.data[1].status, "published");
  assert.equal(result.data[2].status, "draft", "valor desconhecido cai pro default seguro 'draft', nunca 'published' por engano");
});

test("getAllTemplatesFromDb: templates_preview vazia -> 'empty', mesmo que kits tenha linhas", async () => {
  const { getAllTemplatesFromDb } = load(
    makeFakeSupabase({
      kitsList: { data: [{ id: "k1", slug: "social-media" }], error: null },
      templatesPreviewList: { data: [], error: null },
    }),
  );
  const result = await getAllTemplatesFromDb();
  assert.equal(result.status, "empty");
});

test("getAllTemplatesFromDb: resolve kitSlug via join client-side (kit_id -> slug), nunca deixa kitSlug errado quando o kit existe", async () => {
  const { getAllTemplatesFromDb } = load(
    makeFakeSupabase({
      kitsList: { data: [{ id: "k1", slug: "social-media" }], error: null },
      templatesPreviewList: {
        data: [
          {
            id: "t1",
            kit_id: "k1",
            pack_id: null,
            slug: "template01",
            title: "Carrossel 01",
            description: null,
            category: "Carrossel",
            preview_image_url: "/x.png",
            carousel_image_urls: ["/x.png"],
            aspect_ratio: "4/5",
          },
        ],
        error: null,
      },
    }),
  );
  const result = await getAllTemplatesFromDb();
  assert.equal(result.status, "ok");
  assert.equal(result.data[0].kitSlug, "social-media");
  // canvaUrl nunca vem desta camada — a view não expõe canva_editable_url.
  assert.equal(result.data[0].canvaUrl, null);
});

test("getAllTemplatesFromDb: template com kit_id que não bate com nenhum kit retornado -> kitSlug null, nunca um slug de outro kit por engano", async () => {
  const { getAllTemplatesFromDb } = load(
    makeFakeSupabase({
      kitsList: { data: [], error: null }, // kit_id "k-orfao" não existe na lista de kits
      templatesPreviewList: {
        data: [
          {
            id: "t1",
            kit_id: "k-orfao",
            pack_id: null,
            slug: "template01",
            title: "Carrossel 01",
            description: null,
            category: "Carrossel",
            preview_image_url: null,
            carousel_image_urls: null,
            aspect_ratio: "4/5",
          },
        ],
        error: null,
      },
    }),
  );
  const result = await getAllTemplatesFromDb();
  assert.equal(result.status, "ok");
  assert.equal(result.data[0].kitSlug, null);
});

test("getAllTemplatesFromDb: erro ao consultar kits propaga como 'error', mesmo que templates_preview tenha respondido bem", async () => {
  const { getAllTemplatesFromDb } = load(
    makeFakeSupabase({
      kitsList: { data: null, error: { message: "kits query failed" } },
      templatesPreviewList: { data: [{ id: "t1", slug: "template01" }], error: null },
    }),
  );
  const result = await getAllTemplatesFromDb();
  assert.equal(result.status, "error");
  assert.equal(result.error, "kits query failed");
});

test("getTemplateBySlugFromDb: slug inexistente -> 'empty', nunca lança", async () => {
  const { getTemplateBySlugFromDb } = load(
    makeFakeSupabase({ templatesPreviewSingle: { data: null, error: null } }),
  );
  const result = await getTemplateBySlugFromDb("nao-existe");
  assert.equal(result.status, "empty");
});

test("getTemplateBySlugFromDb: erro do banco -> 'error' com a mensagem original", async () => {
  const { getTemplateBySlugFromDb } = load(
    makeFakeSupabase({ templatesPreviewSingle: { data: null, error: { message: "timeout" } } }),
  );
  const result = await getTemplateBySlugFromDb("template01");
  assert.equal(result.status, "error");
  assert.equal(result.error, "timeout");
});

test("getTemplateBySlugFromDb: consulta de verdade filtra por slug (coluna certa, valor certo) — não só 'alguma coisa que retorna o resultado esperado'", async () => {
  const factory = makeFakeSupabase({
    templatesPreviewSingle: { data: { id: "t1", kit_id: null, slug: "template01", title: "T", description: null, category: "Feed", preview_image_url: null, carousel_image_urls: null, aspect_ratio: "4/5" }, error: null },
  });
  const { getTemplateBySlugFromDb } = load(factory);
  await getTemplateBySlugFromDb("template01");

  const templateQuery = factory.calls.eqArgs.find((c) => c.table === "templates_preview");
  assert.ok(templateQuery, "esperava uma chamada .eq() na tabela templates_preview");
  assert.equal(templateQuery.column, "slug", "deveria filtrar por 'slug', não por outra coluna");
  assert.equal(templateQuery.value, "template01");
});

test("getTemplateBySlugFromDb: achado da auditoria corrigido — erro ao resolver o slug do kit agora propaga como 'error', nunca é engolido como kitSlug: null", async () => {
  const { getTemplateBySlugFromDb } = load(
    makeFakeSupabase({
      templatesPreviewSingle: {
        data: {
          id: "t1",
          kit_id: "k1",
          pack_id: null,
          slug: "template01",
          title: "T",
          description: null,
          category: "Feed",
          preview_image_url: null,
          carousel_image_urls: null,
          aspect_ratio: "4/5",
        },
        error: null,
      },
      kitSingle: { data: null, error: { message: "kit lookup failed" } },
    }),
  );
  const result = await getTemplateBySlugFromDb("template01");
  assert.equal(result.status, "error", "antes da correção, isto voltava 'ok' com kitSlug: null, escondendo o erro real");
  assert.equal(result.error, "kit lookup failed");
});

test("getKitsWithRealContentFromDb: só devolve kits que têm pelo menos 1 template real associado — equivalente a kitHasRealContent/getKitsWithRealContent (src/lib/kits.ts), que faltava nesta camada", async () => {
  const { getKitsWithRealContentFromDb } = load(
    makeFakeSupabase({
      kitsList: {
        data: [
          { id: "k1", slug: "social-media", title: "Social Media", description: "d", status: "draft" },
          { id: "k2", slug: "sem-templates", title: "Vazio", description: "d2", status: "draft" },
        ],
        error: null,
      },
      templatesPreviewList: {
        data: [
          { id: "t1", kit_id: "k1", pack_id: null, slug: "template01", title: "T", description: null, category: "Feed", preview_image_url: null, carousel_image_urls: null, aspect_ratio: "4/5" },
        ],
        error: null,
      },
    }),
  );
  const result = await getKitsWithRealContentFromDb();
  assert.equal(result.status, "ok");
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].slug, "social-media");
});

test("getKitsWithRealContentFromDb: propaga erro se a consulta de kits OU a de templates falhar", async () => {
  const { getKitsWithRealContentFromDb } = load(
    makeFakeSupabase({ kitsList: { data: null, error: { message: "kits down" } } }),
  );
  const result = await getKitsWithRealContentFromDb();
  assert.equal(result.status, "error");
  assert.equal(result.error, "kits down");
});
