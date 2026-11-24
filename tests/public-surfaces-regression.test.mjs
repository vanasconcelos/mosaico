// Teste de REGRESSÃO de ponta a ponta para a correção de 2026-11-24
// ("Correção Autorizada do Catálogo"). tests/catalog-resolver.test.mjs
// já prova, no nível de src/lib/catalog.ts, que a allowlist de
// distribuição (real, vazia) não filtra mais getAllTemplates/
// getTemplateBySlug. Este arquivo vai um nível acima: exercita as
// PÁGINAS/COMPONENTES de verdade (/kits e o Hero da home), com o banco
// vazio (cai pro fallback estático) e a allowlist REAL — exatamente a
// combinação que, antes da correção, fazia 11/11 kits aparecerem como
// "Em preparação" e o Hero ficar sem nenhuma peça real (confirmado ao
// vivo no Preview, documentado no relatório da triagem).
//
// Nenhum DOM/renderer é usado — mesma técnica já empregada em
// tests/templates-page.test.mjs: um elemento React é só um objeto
// { type, props }, e um Server Component async é só uma função normal
// que pode ser chamada (e, se async, aguardada) diretamente.

import test from "node:test";
import assert from "node:assert/strict";
import { compile, injectFakeModule, clearModuleCache, requireCompiled } from "./helpers/compile.mjs";

const KITS_PAGE_ENTRY = "src/app/kits/page.tsx";
const HERO_ENTRY = "src/components/sections/Hero.tsx";

compile([KITS_PAGE_ENTRY, HERO_ENTRY, "src/lib/kits.ts", "src/lib/templates.ts"]);

const { getAllKits: getAllKitsStatic } = requireCompiled("src/lib/kits.ts");

/**
 * Percorre uma árvore de elementos React (objetos { type, props }) em
 * busca de todo elemento que satisfaça `predicate` — usado aqui pra
 * localizar, sem depender da estrutura exata de JSX de cada componente,
 * tanto os cards do catálogo (identificados por terem `props.kit`)
 * quanto o rótulo "Em preparação" (identificado pelo texto exato do
 * `children`).
 */
function collectElements(node, predicate, found = []) {
  if (!node || typeof node !== "object") return found;
  if (predicate(node)) found.push(node);
  const children = node.props && node.props.children;
  if (Array.isArray(children)) {
    for (const child of children) collectElements(child, predicate, found);
  } else if (children && typeof children === "object") {
    collectElements(children, predicate, found);
  }
  return found;
}

function freshCatalogDb() {
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
  // Nenhum fake para lib/server/distribution-allowlist — usa a allowlist
  // REAL (vazia). É exatamente essa combinação que reproduzia o bug.
}

test("/kits: com banco vazio (fallback estático) e a allowlist de distribuição REAL (vazia), nem todo kit aparece 'Em preparação' — pelo menos um kit com conteúdo real mostra a capa de verdade", async () => {
  freshCatalogDb();
  const { default: KitsCatalogPage } = requireCompiled(KITS_PAGE_ENTRY);

  const pageElement = await KitsCatalogPage();

  const cardElements = collectElements(pageElement, (el) => el.props && el.props.kit !== undefined);
  assert.equal(
    cardElements.length,
    getAllKitsStatic().length,
    "esperava um card por kit estático (11 hoje) — a página não deveria filtrar nenhum kit",
  );

  const renderedCards = [];
  for (const card of cardElements) {
    renderedCards.push(await card.type(card.props));
  }

  const emPreparacao = renderedCards.filter(
    (rendered) => collectElements(rendered, (el) => el.props && el.props.children === "Em preparação").length > 0,
  );

  assert.ok(
    emPreparacao.length < cardElements.length,
    `regressão do achado crítico: ${emPreparacao.length}/${cardElements.length} kits apareceram 'Em preparação' — esperava PELO MENOS 1 kit com conteúdo real visível`,
  );
  assert.ok(
    emPreparacao.length > 0,
    "kits genuinamente sem template real (ex.: 'hof') ainda devem mostrar 'Em preparação' — isso não é a regressão, é o comportamento correto",
  );
});

test("Hero: com banco vazio (fallback estático) e a allowlist de distribuição REAL (vazia), o leque de peças não fica vazio — pelo menos 1 TemplatePreview real no cluster", async () => {
  freshCatalogDb();
  const { Hero } = requireCompiled(HERO_ENTRY);

  const heroElement = await Hero();

  // O leque (cluster[0]/[1]/[2]) é a única parte do Hero que renderiza
  // <TemplatePreview template={...} placeholderStyle="pending" .../> —
  // identificado aqui pela combinação dessas duas props, sem depender
  // de import/igualdade de referência do componente em si.
  const clusterPreviews = collectElements(
    heroElement,
    (el) => el.props && el.props.placeholderStyle === "pending" && el.props.template,
  );

  assert.ok(
    clusterPreviews.length > 0,
    "regressão do achado crítico: o Hero ficou sem nenhuma peça real no leque (mesmo sintoma confirmado ao vivo no Preview antes da correção)",
  );
});
