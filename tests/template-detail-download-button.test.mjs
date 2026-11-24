// Teste dedicado (Fase 4.60) a uma única coisa: o botão "Baixar modelo
// pronto" só aparece na árvore de elementos de <TemplateDetail> quando
// `downloadAllowed` é `true` — nunca por conta própria, sempre pela prop
// resolvida no servidor (page.tsx) a partir da mesma allowlist de
// distribuição do endpoint de download (nenhuma lógica duplicada aqui).
//
// Mesma técnica de templates-page.test.mjs: chama o componente (uma
// função comum, "use client" só importa pra bundling do Next — não
// impede rodar fora dele) como função pura e inspeciona o elemento React
// devolvido ({ type, props }), sem precisar de DOM nem de um renderer —
// os componentes filhos ("use client") nunca são de fato executados
// (seus hooks internos não rodam), só referenciados por tipo.

import test from "node:test";
import assert from "node:assert/strict";
import { compile, requireCompiled } from "./helpers/compile.mjs";

const DETAIL_ENTRY = "src/components/templates/TemplateDetail.tsx";
const DOWNLOAD_BUTTON_ENTRY = "src/components/templates/DownloadTemplateButton.tsx";
const EDIT_BUTTON_ENTRY = "src/components/templates/EditInCanvaButton.tsx";

compile([DETAIL_ENTRY, DOWNLOAD_BUTTON_ENTRY, EDIT_BUTTON_ENTRY]);

const { TemplateDetail } = requireCompiled(DETAIL_ENTRY);
const { DownloadTemplateButton } = requireCompiled(DOWNLOAD_BUTTON_ENTRY);
const { EditInCanvaButton } = requireCompiled(EDIT_BUTTON_ENTRY);

const TEMPLATE = {
  id: "t1",
  title: "Template de teste",
  slug: "template-de-teste",
  category: "Feed",
  kitSlug: "social-media",
  packSlug: null,
  description: "Descrição de teste",
  previewImageUrl: null,
  carouselImageUrls: undefined,
  canvaUrl: null,
  aspectRatio: "4/5",
  createdAt: "2026-01-01",
};

/** Percorre a árvore de elementos React (profundidade, sem limite),
 * devolvendo todos os elementos cujo `type` é exatamente `targetType`. */
function findElementsByType(element, targetType, found = []) {
  if (!element || typeof element !== "object") return found;
  if (element.type === targetType) found.push(element);
  const children = element.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) findElementsByType(child, targetType, found);
  } else if (children) {
    findElementsByType(children, targetType, found);
  }
  return found;
}

test("downloadAllowed: false -> <DownloadTemplateButton> não aparece na árvore, <EditInCanvaButton> continua presente (com editLinkAvailable: true)", () => {
  const tree = TemplateDetail({
    template: TEMPLATE,
    hasPaidAccess: true,
    signedUrls: null,
    downloadAllowed: false,
    editLinkAvailable: true,
  });

  const downloadButtons = findElementsByType(tree, DownloadTemplateButton);
  const editButtons = findElementsByType(tree, EditInCanvaButton);

  assert.equal(downloadButtons.length, 0, "o botão de download não deve ser renderizado quando downloadAllowed é false");
  assert.equal(editButtons.length, 1, "o componente de editar no Canva deve continuar presente (sua própria lógica decide o estado, ver edit-in-canva-button.test.mjs)");
  assert.equal(editButtons[0].props.editLinkAvailable, true);
});

test("downloadAllowed: true -> <DownloadTemplateButton> aparece na árvore, junto com <EditInCanvaButton>", () => {
  const tree = TemplateDetail({
    template: TEMPLATE,
    hasPaidAccess: true,
    signedUrls: null,
    downloadAllowed: true,
    editLinkAvailable: true,
  });

  const downloadButtons = findElementsByType(tree, DownloadTemplateButton);
  const editButtons = findElementsByType(tree, EditInCanvaButton);

  assert.equal(downloadButtons.length, 1, "o botão de download deve aparecer quando downloadAllowed é true");
  assert.equal(downloadButtons[0].props.slug, TEMPLATE.slug);
  assert.equal(editButtons.length, 1);
});

test("TemplateDetail repassa editLinkAvailable: false pro <EditInCanvaButton>, sem decidir nada por conta própria", () => {
  const tree = TemplateDetail({
    template: TEMPLATE,
    hasPaidAccess: true,
    signedUrls: null,
    downloadAllowed: true,
    editLinkAvailable: false,
  });

  const editButtons = findElementsByType(tree, EditInCanvaButton);
  assert.equal(editButtons.length, 1);
  assert.equal(editButtons[0].props.editLinkAvailable, false);
});

test("downloadAllowed: false -> o texto explicativo não menciona baixar/usar a arte como está, só edição no Canva", () => {
  const tree = TemplateDetail({
    template: TEMPLATE,
    hasPaidAccess: true,
    signedUrls: null,
    downloadAllowed: false,
    editLinkAvailable: true,
  });

  // Procura qualquer texto (string) em toda a árvore que mencione "baixar"
  // ou "como está" — não deveria existir nenhum enquanto o download não
  // estiver liberado, pra não anunciar uma entrega indisponível.
  const textos = [];
  (function coletar(el) {
    if (el == null) return;
    if (typeof el === "string") {
      textos.push(el);
      return;
    }
    if (Array.isArray(el)) {
      el.forEach(coletar);
      return;
    }
    if (typeof el === "object") coletar(el.props?.children);
  })(tree);

  const textoCompleto = textos.join(" ").toLowerCase();
  assert.equal(textoCompleto.includes("como está"), false, "não deve prometer 'usar a arte como está' sem o download disponível");
  assert.ok(textoCompleto.includes("canva"), "deve mencionar o caminho real de entrega (Canva)");
});
