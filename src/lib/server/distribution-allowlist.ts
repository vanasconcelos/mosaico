/**
 * Fonte única de verdade de quais templates estão autorizados a
 * distribuir seus arquivos finais (páginas exportadas em imagem) — seja
 * via `.zip` (`/api/templates/[slug]/download`) ou via URLs assinadas na
 * galeria paga (`/templates/[slug]`). Criada na Fase 4.58, depois da
 * auditoria de licenciamento Canva (Fases 1-4.57) ter identificado que
 * nenhum dos 323 templates teve sua composição (Pro/Free/próprio)
 * verificada individualmente ainda.
 *
 * Deliberadamente vazia até que a inspeção visual individual (protocolo
 * em docs/canva-protocolo-auditoria-manual.md, feita só pela Ana) aprove
 * um slug — nunca presumir aprovação, nunca usar um fallback permissivo.
 * "Editar no Canva" (Template Link) não depende disto — é liberado
 * separadamente, sempre, independente desta lista (ver
 * src/app/api/templates/[slug]/edit-link/route.ts).
 *
 * Alterar esta lista é a ÚNICA ação esperada pra liberar um template:
 * adicionar o slug aqui só depois de ele estar classificado como
 * "Aprovado" ou "Aprovado com restrições" em
 * docs/canva-licenciamento-inventario.csv — nunca antes.
 */
const DISTRIBUTION_ALLOWLIST: ReadonlySet<string> = new Set([
  // Vazio de propósito — nenhum dos 323 templates foi aprovado ainda.
]);

/**
 * `true` só se o slug estiver explicitamente no conjunto acima. Nunca
 * `true` por ausência de proibição, nunca por semelhança com outro slug
 * já liberado — cada entrada é uma decisão individual.
 */
export function isDistributionAllowed(slug: string): boolean {
  return DISTRIBUTION_ALLOWLIST.has(slug);
}
