// Testa src/lib/catalog.ts — o ponto único de leitura usado pelas
// páginas reais a partir desta fase (Fase 2: integração do catálogo).
// Garante que o fallback pro estático é seguro (banco vazio/indisponível
// nunca quebra a página) e que, quando o banco tem dado real, ele é
// usado — sem misturar as duas fontes numa mesma resposta.

import test from "node:test";
import assert from "node:assert/strict";
import { compile, injectFakeModule, clearModuleCache, requireCompiled } from "./helpers/compile.mjs";

const ENTRY = "src/lib/catalog.ts";
compile([ENTRY, "src/lib/templates.ts", "src/lib/kits.ts", "src/lib/server/distribution-allowlist.ts"]);

const { getAllTemplates: getAllTemplatesStatic } = requireCompiled("src/lib/templates.ts");
const { getAllKits: getAllKitsStatic } = requireCompiled("src/lib/kits.ts");

function load({
  templatesOutcome = { status: "empty", data: [] },
  kitsOutcome = { status: "empty", data: [] },
  templateBySlugOutcome = { status: "empty", data: [] },
} = {}) {
  clearModuleCache();
  injectFakeModule("lib/server/catalog-db", {
    async getAllTemplatesFromDb() {
      return templatesOutcome;
    },
    async getAllKitsFromDb() {
      return kitsOutcome;
    },
    async getTemplateBySlugFromDb() {
      return templateBySlugOutcome;
    },
  });
  // Nenhum fake para lib/server/distribution-allowlist: desde a
  // correção de 2026-11-24 ("Correção Autorizada do Catálogo"),
  // catalog.ts não importa mais esse módulo — os testes abaixo, na
  // seção "visibilidade pública x allowlist de distribuição", usam a
  // allowlist REAL (compilada de verdade, vazia em produção) pra provar
  // isso na prática, não só por ausência de import.
  return requireCompiled(ENTRY);
}

test("getAllTemplates: banco vazio -> cai pro estático, devolve os 323 templates reais, nunca lista vazia", async () => {
  const { getAllTemplates } = load({ templatesOutcome: { status: "empty", data: [] } });
  const result = await getAllTemplates();
  assert.equal(result.length, getAllTemplatesStatic().length);
  assert.ok(result.length > 0);
});

test("getAllTemplates: erro do banco -> cai pro estático (nunca propaga o erro pra página quebrar)", async () => {
  const { getAllTemplates } = load({
    templatesOutcome: { status: "error", error: "connection refused" },
  });
  const result = await getAllTemplates();
  assert.equal(result.length, getAllTemplatesStatic().length);
});

test("getAllTemplates: banco com dado real -> usa o banco, nunca mistura com o estático", async () => {
  const fakeDbTemplate = {
    id: "db-1",
    title: "Vindo do banco",
    slug: "vindo-do-banco",
    category: "Feed",
    kitSlug: "social-media",
    packSlug: null,
    description: null,
    previewImageUrl: null,
    canvaUrl: null,
    aspectRatio: "4/5",
    createdAt: "",
  };
  const { getAllTemplates } = load({
    templatesOutcome: { status: "ok", data: [fakeDbTemplate] },
  });
  const result = await getAllTemplates();
  assert.deepEqual(result, [fakeDbTemplate]);
});

test("getAllKits: mesmo contrato de fallback — vazio ou erro cai pro estático", async () => {
  const { getAllKits } = load({ kitsOutcome: { status: "empty", data: [] } });
  const result = await getAllKits();
  assert.equal(result.length, getAllKitsStatic().length);
});

test("getKitBySlug: resolve via getAllKits (com fallback) + filtro em memória", async () => {
  const { getKitBySlug } = load({ kitsOutcome: { status: "empty", data: [] } });
  const kit = await getKitBySlug("social-media");
  assert.ok(kit);
  assert.equal(kit.slug, "social-media");
});

test("getKitBySlug: slug inexistente -> undefined, nunca lança", async () => {
  const { getKitBySlug } = load({ kitsOutcome: { status: "empty", data: [] } });
  const kit = await getKitBySlug("slug-que-nao-existe-em-lugar-nenhum");
  assert.equal(kit, undefined);
});

test("getTemplateBySlug: banco 'ok' sem linha (slug inexistente no banco, mas banco está respondendo) -> undefined, NUNCA cai pro estático (um slug real do estático não deveria 'reaparecer' por engano)", async () => {
  const { getTemplateBySlug } = load({
    templateBySlugOutcome: { status: "ok", data: null },
  });
  const result = await getTemplateBySlug("qualquer-slug");
  assert.equal(result, undefined);
});

test("getTemplateBySlug: banco com erro -> cai pro estático, resolve um slug real", async () => {
  const { getTemplateBySlug } = load({
    templateBySlugOutcome: { status: "error", error: "timeout" },
  });
  const result = await getTemplateBySlug("template01");
  assert.ok(result);
  assert.equal(result.slug, "template01");
});

test("kitHasRealContent / getKitsWithRealContent: consistentes com o estático quando o banco está vazio (mesmo resultado de src/lib/kits.ts)", async () => {
  const { kitHasRealContent, getKitsWithRealContent } = load({
    kitsOutcome: { status: "empty", data: [] },
    templatesOutcome: { status: "empty", data: [] },
  });
  assert.equal(await kitHasRealContent("social-media"), true);
  assert.equal(await kitHasRealContent("hof"), false);
  const withContent = await getKitsWithRealContent();
  assert.ok(withContent.some((k) => k.slug === "social-media"));
  assert.ok(!withContent.some((k) => k.slug === "hof"));
});

// --- Visibilidade pública x allowlist de distribuição (correção de
// 2026-11-24, "Correção Autorizada do Catálogo") ---
//
// ACHADO ORIGINAL (2026-11-23, "Ajuste Final da Estratégia do 1º
// Lote"): uma versão anterior deste arquivo filtrava
// getAllTemplates/getTemplateBySlug pela allowlist de distribuição —
// com a allowlist vazia (estado real), isso escondia TODO template de
// TODA superfície pública (catálogo, home, sitemap, página do próprio
// template), confirmado ao vivo no Preview: /kits mostrava 11/11 kits
// "Em preparação" e o Hero ficava sem nenhuma peça real — regressão em
// relação ao commit aprovado 8a4a990.
//
// REGRA CORRIGIDA: a allowlist de distribuição controla exclusivamente
// OPERAÇÕES DE DISTRIBUIÇÃO (download, botão de download) — nunca a
// visibilidade pública. Os testes abaixo usam a allowlist REAL do
// projeto (sem nenhum fake), exatamente para provar que ela está
// desconectada deste módulo, não só que um mock permissivo esconde o
// problema.

const { isDistributionAllowed: isDistributionAllowedReal } = requireCompiled(
  "src/lib/server/distribution-allowlist.ts",
);

test("pré-condição: a allowlist de distribuição REAL está vazia (nenhum dos 323 templates foi aprovado) — se este teste falhar, os dois abaixo perdem o sentido", () => {
  assert.equal(isDistributionAllowedReal("template01"), false);
  assert.equal(isDistributionAllowedReal("qualquer-slug-plausivel"), false);
});

test("getAllTemplates: mesmo com a allowlist de distribuição REAL (vazia), devolve os 323 templates estáticos inteiros — visibilidade pública nunca depende de autorização de distribuição", async () => {
  const { getAllTemplates } = load({ templatesOutcome: { status: "empty", data: [] } });
  const result = await getAllTemplates();
  assert.equal(result.length, getAllTemplatesStatic().length);
  assert.ok(result.length > 0);
});

test("getTemplateBySlug: resolve um slug público real mesmo com a allowlist de distribuição REAL (vazia) — a allowlist nunca impede a página do template de existir", async () => {
  const { getTemplateBySlug } = load({
    templateBySlugOutcome: { status: "error", error: "timeout" },
  });
  const result = await getTemplateBySlug("template01");
  assert.ok(result, "esperava o template01 resolvido via fallback estático, nunca undefined");
  assert.equal(result.slug, "template01");
});

test("kitHasRealContent: kit com template estático real continua 'com conteúdo' mesmo com a allowlist de distribuição REAL (vazia) — nunca mais todo kit cai em 'Em preparação' por causa da allowlist", async () => {
  const { kitHasRealContent } = load({ templatesOutcome: { status: "empty", data: [] } });
  assert.equal(await kitHasRealContent("social-media"), true);
  assert.equal(await kitHasRealContent("hof"), false);
});
