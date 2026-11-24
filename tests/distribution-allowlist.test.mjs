// Testa src/lib/server/distribution-allowlist.ts isoladamente — fonte
// única de verdade de QUAIS templates podem ser distribuídos (download/
// edição), nunca de quais podem APARECER publicamente (essa separação é
// o objeto da correção de 2026-11-24, "Correção Autorizada do
// Catálogo" — ver tests/catalog-resolver.test.mjs para os testes de
// visibilidade pública).
//
// Sem nenhum fake aqui de propósito: o objetivo é travar o estado REAL
// do arquivo, não um comportamento simulado.

import test from "node:test";
import assert from "node:assert/strict";
import { compile, requireCompiled } from "./helpers/compile.mjs";

const ENTRY = "src/lib/server/distribution-allowlist.ts";
compile([ENTRY, "src/lib/templates.ts"]);

const { isDistributionAllowed } = requireCompiled(ENTRY);
const { getAllTemplates: getAllTemplatesStatic } = requireCompiled("src/lib/templates.ts");

test("a allowlist de distribuição está vazia — nenhum dos templates reais foi aprovado para distribuição", () => {
  const templates = getAllTemplatesStatic();
  assert.ok(templates.length > 0, "pré-condição: precisa haver templates reais pra este teste fazer sentido");
  for (const template of templates) {
    assert.equal(
      isDistributionAllowed(template.slug),
      false,
      `esperava '${template.slug}' fora da allowlist — nenhum template deveria estar aprovado hoje`,
    );
  }
});

test("isDistributionAllowed: nunca true por ausência de proibição — slug inventado/plausível continua bloqueado", () => {
  assert.equal(isDistributionAllowed("slug-que-nao-existe-em-lugar-nenhum"), false);
  assert.equal(isDistributionAllowed(""), false);
});

test("isDistributionAllowed: função pura, sem efeito colateral — duas chamadas com o mesmo slug sempre concordam", () => {
  const slug = "template01";
  assert.equal(isDistributionAllowed(slug), isDistributionAllowed(slug));
});
