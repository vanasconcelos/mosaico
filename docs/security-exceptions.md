# Registro de exceções de segurança — Mosaico

Este documento registra vulnerabilidades reportadas por ferramentas de
auditoria de dependências (`npm audit`) que foram avaliadas e, por decisão
explícita, não corrigidas de imediato. Cada entrada tem prazo de
reavaliação — não é um registro de aceitação permanente.

---

## 2026-10-21 — GHSA-vfj7-8cjw-p6xm (braces@3.0.3)

**Status:** exceção temporária — não corrigida, não suprimida no `npm audit`,
sem uso de overrides.

**Aviso:** [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
— negação de serviço (DoS) por esgotamento de pilha via padrões de chave
profundamente aninhados. CWE-674. CVSS 7.5 ("high"). Intervalo afetado:
`<=3.0.3`. Versão corrigida publicada pelo mantenedor: **nenhuma**.

**Pacote vulnerável:** `braces@3.0.3` (transitivo).

**Cadeia de dependências afetada** (devDependency, nunca entra no bundle de
produção):

`eslint-config-next@16.3.5` (direto, devDependency) → `@next/eslint-plugin-next@16.3.5` → `fast-glob@3.3.1` → `micromatch@4.0.8` → `braces@3.0.3` ← pacote vulnerável

**Ocorrências no `npm audit`:** o relatório lista 5 entradas (`braces`,
`micromatch`, `fast-glob`, `@next/eslint-plugin-next`, `eslint-config-next`).
Investigação confirmou que são **o mesmo aviso** se propagando pela cadeia
acima — não 5 vulnerabilidades distintas.

**Justificativa para não aplicar o downgrade sugerido pelo
`npm audit fix --force`:** a única correção que elimina a cadeia por completo
é rebaixar `eslint-config-next` para `14.2.35` (versão que usa `glob@10.3.10`
em vez de `fast-glob`/`micromatch`/`braces`). Essa versão declara
`peerDependencies: { eslint: "^7.23.0 || ^8.0.0" }`, incompatível com o
`eslint@9.39.5` atualmente instalado no projeto (configuração flat-config
moderna). Aplicar o downgrade exigiria também rebaixar o ESLint em duas
versões principais, com risco real de quebrar a configuração de lint atual —
um custo desproporcional ao risco real da vulnerabilidade. Pela mesma razão,
não se opta por remover `eslint-config-next` e substituí-lo por uma
configuração própria: isso eliminaria a cadeia vulnerável, mas descartaria as
regras oficiais de lint do Next.js (uso correto de `next/image`, convenções
do App Router etc.) sem necessidade, dado que não há correção alternativa
menos custosa disponível hoje.

**Avaliação de exposição:** a cadeia é introduzida por uma dependência de
desenvolvimento e não foi identificada no bundle de produção analisado. Essa
constatação se refere ao estado examinado e não constitui garantia para
builds futuros. O caminho vulnerável só executa localmente ou em CI, durante
`npm run lint` ou a etapa de lint do build, processando padrões de caminho do
próprio código-fonte do projeto — nunca uma entrada controlada por um
visitante ou por uma requisição HTTP.

Isso **não significa risco zero**: é uma avaliação de exposição no uso atual
do projeto, não uma ausência de vulnerabilidade. Se o pipeline de lint/build
passar a processar padrões de glob derivados de entrada externa, ou se a
cadeia de dependências mudar, essa avaliação deixa de valer.

**Data da decisão:** 2026-10-21.
**Prazo de reavaliação:** 2026-11-20 (30 dias). Nessa data, é obrigatório
executar novamente `npm audit`, verificar as versões publicadas de cada
pacote da cadeia e consultar o aviso oficial — mesmo que não tenha surgido
nenhuma notícia de correção até lá.

**Critérios para reabrir a análise antes do prazo:**
- Publicação de uma versão corrigida de `braces` (ou de qualquer pacote da
  cadeia que deixe de depender da versão vulnerável).
- Qualquer mudança na cadeia de dependências acima (atualização de
  `eslint-config-next`, `@next/eslint-plugin-next`, `fast-glob` ou
  `micromatch`).
- Alteração no uso de lint/build do projeto que passe a processar entrada
  externa (ex.: caminhos de arquivo vindos de configuração dinâmica, upload,
  ou qualquer fonte não controlada pelo próprio código-fonte).
- Surgimento de evidência pública de exploração ativa deste aviso.
