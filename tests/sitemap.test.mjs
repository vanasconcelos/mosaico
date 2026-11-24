// Teste do sitemap — garante que páginas institucionais e as sub-rotas
// de categoria (apresentações, conteúdo jurídico) entram no sitemap, e
// que nenhuma delas aponta para uma rota que na prática daria 404
// (mesmo filtro usado pelas próprias páginas em
// src/app/kits/[slug]/apresentacoes e .../conteudo-juridico).
//
// Desde a Fase 2 (integração do catálogo real via src/lib/catalog.ts),
// `sitemap()` é async e passa pelo leitor do Supabase antes de cair pro
// estático — por isso o banco é mockado como vazio aqui (mesmo padrão
// de download.test.mjs/catalog-resolver.test.mjs): este arquivo testa
// o CONTEÚDO do sitemap contra a fonte estática (ground truth), não a
// integração com o banco em si (isso já é coberto por
// catalog-resolver.test.mjs e catalog-db.test.mjs).

import test from "node:test";
import assert from "node:assert/strict";
import { compile, injectFakeModule, clearModuleCache, requireCompiled } from "./helpers/compile.mjs";

const SITEMAP_ENTRY = "src/app/sitemap.ts";
const TEMPLATES_ENTRY = "src/lib/templates.ts";
const KITS_ENTRY = "src/lib/kits.ts";

compile([SITEMAP_ENTRY, TEMPLATES_ENTRY, KITS_ENTRY]);

clearModuleCache();
injectFakeModule("lib/server/catalog-db", {
  async getAllTemplatesFromDb() {
    return { status: "empty", data: [] };
  },
  async getAllKitsFromDb() {
    return { status: "empty", data: [] };
  },
  async getTemplateBySlugFromDb() {
    return { status: "empty", data: [] };
  },
});
// Nenhum fake para lib/server/distribution-allowlist: desde a correção
// de 2026-11-24 ("Correção Autorizada do Catálogo"), `getAllTemplates`
// não filtra mais por ela — este arquivo roda com a allowlist REAL
// (vazia) exatamente pra provar que o sitemap continua completo mesmo
// assim (ver tests/catalog-resolver.test.mjs e
// tests/public-surfaces-regression.test.mjs para a mesma garantia nos
// outros pontos de leitura pública).

const { default: sitemap } = requireCompiled(SITEMAP_ENTRY);
const { getAllTemplates } = requireCompiled(TEMPLATES_ENTRY);
const { getKitsWithRealContent } = requireCompiled(KITS_ENTRY);

test("sitemap inclui as três páginas institucionais", async () => {
  const urls = (await sitemap()).map((entry) => entry.url);
  assert.ok(urls.some((u) => u.endsWith("/sobre")));
  assert.ok(urls.some((u) => u.endsWith("/politica-de-privacidade")));
  assert.ok(urls.some((u) => u.endsWith("/termos-de-uso")));
});

test("sitemap inclui todo template real, exatamente uma vez", async () => {
  const urls = (await sitemap()).map((entry) => entry.url);
  const templates = getAllTemplates();
  for (const template of templates) {
    const matches = urls.filter((u) => u.endsWith(`/templates/${template.slug}`));
    assert.equal(matches.length, 1, `esperava exatamente 1 entrada para ${template.slug}`);
  }
});

test("sitemap inclui todo kit com conteúdo real, exatamente uma vez", async () => {
  const urls = (await sitemap()).map((entry) => entry.url);
  for (const kit of getKitsWithRealContent()) {
    const matches = urls.filter((u) => u.endsWith(`/kits/${kit.slug}`));
    assert.equal(matches.length, 1, `esperava exatamente 1 entrada para /kits/${kit.slug}`);
  }
});

test("toda URL de /apresentacoes no sitemap corresponde a um kit com pelo menos 1 template 'Apresentação' — nunca uma rota que daria 404", async () => {
  const urls = (await sitemap()).map((entry) => entry.url);
  const templates = getAllTemplates();
  const apresentacoesUrls = urls.filter((u) => u.endsWith("/apresentacoes"));

  assert.ok(apresentacoesUrls.length > 0, "esperava pelo menos 1 kit com Apresentações");

  for (const url of apresentacoesUrls) {
    const kitSlug = url.split("/kits/")[1].replace("/apresentacoes", "");
    const temApresentacaoReal = templates.some(
      (t) => t.kitSlug === kitSlug && t.category === "Apresentação",
    );
    assert.ok(temApresentacaoReal, `${url} não corresponde a nenhum template real`);
  }
});

test("toda URL de /conteudo-juridico no sitemap corresponde a um kit com pelo menos 1 template 'Conteúdo Jurídico' — nunca uma rota que daria 404", async () => {
  const urls = (await sitemap()).map((entry) => entry.url);
  const templates = getAllTemplates();
  const conteudoJuridicoUrls = urls.filter((u) => u.endsWith("/conteudo-juridico"));

  assert.ok(conteudoJuridicoUrls.length > 0, "esperava pelo menos 1 kit com Conteúdo Jurídico");

  for (const url of conteudoJuridicoUrls) {
    const kitSlug = url.split("/kits/")[1].replace("/conteudo-juridico", "");
    const temConteudoJuridicoReal = templates.some(
      (t) => t.kitSlug === kitSlug && t.category === "Conteúdo Jurídico",
    );
    assert.ok(temConteudoJuridicoReal, `${url} não corresponde a nenhum template real`);
  }
});

test("completude (achado de auditoria — faltava o inverso dos 2 testes acima): todo kit que TEM template 'Apresentação'/'Conteúdo Jurídico' real aparece no sitemap, nunca omitido por engano", async () => {
  const urls = (await sitemap()).map((entry) => entry.url);
  const templates = getAllTemplates();

  const kitSlugsComApresentacaoReal = new Set(
    templates.filter((t) => t.category === "Apresentação" && t.kitSlug).map((t) => t.kitSlug),
  );
  const kitSlugsComConteudoJuridicoReal = new Set(
    templates.filter((t) => t.category === "Conteúdo Jurídico" && t.kitSlug).map((t) => t.kitSlug),
  );

  for (const kitSlug of kitSlugsComApresentacaoReal) {
    assert.ok(
      urls.some((u) => u.endsWith(`/kits/${kitSlug}/apresentacoes`)),
      `kit '${kitSlug}' tem Apresentação real mas não aparece no sitemap`,
    );
  }
  for (const kitSlug of kitSlugsComConteudoJuridicoReal) {
    assert.ok(
      urls.some((u) => u.endsWith(`/kits/${kitSlug}/conteudo-juridico`)),
      `kit '${kitSlug}' tem Conteúdo Jurídico real mas não aparece no sitemap`,
    );
  }
});

test("nenhuma URL do sitemap usa localhost quando NEXT_PUBLIC_SITE_URL não está definida — usa o fallback documentado", async () => {
  const urls = (await sitemap()).map((entry) => entry.url);
  // Em ambiente de teste NEXT_PUBLIC_SITE_URL não está setada, então o
  // fallback ("http://localhost:3000") é o comportamento correto aqui —
  // este teste apenas documenta/trava esse contrato, não afirma que é
  // assim em Preview/Production (lá a variável está setada).
  assert.ok(urls.every((u) => u.startsWith("http://localhost:3000")));
});
