/**
 * Validação de URL de edição do Canva — única fonte de verdade, usada
 * tanto pelo cliente (EditInCanvaButton, ao processar a resposta de
 * `/api/templates/[slug]/edit-link`) quanto por ferramentas locais que
 * nunca rodam no navegador (ex.: scripts/import-canva-links.mjs).
 * Extraído de EditInCanvaButton.tsx (mesma lógica, comportamento
 * idêntico) para nunca existir uma segunda cópia desta regra — ver
 * nota de segurança original: mesmo um valor vindo do próprio backend
 * (nunca do usuário) passa por aqui antes de qualquer navegação, porque
 * uma linha corrompida no banco não deve virar um `window.open`/SQL
 * aceito silenciosamente.
 *
 * Aceita só o Template Link ("Link de modelo", `/view?...&mode=preview`)
 * — nunca a URL de edição colaborativa (`/edit?...`) nem o master. Esta
 * função só valida FORMA (protocolo + host), não o path — a regra de
 * nunca aceitar `/edit` é responsabilidade de quem gera o link (a
 * própria Ana, ao copiar do Canva), não algo detectável só pela URL.
 *
 * `canva.link` (2026-11-23, preparação do primeiro lote de lançamento):
 * domínio curto OFICIAL do próprio Canva — confirmado na Central de
 * Ajuda do Canva ("canva.link domain is the branded part of Canva's
 * official short links"; gerado automaticamente ao compartilhar,
 * incluindo o Template Link). Host exato, sem wildcard de subdomínio
 * (nunca `.canva.link`) — a função "Link in Bio" do Canva publica em
 * `[nome].canva.link`, um recurso completamente diferente (página
 * pública arbitrária, não um link de modelo), que este validador nunca
 * deve aceitar.
 */
export const ALLOWED_CANVA_HOSTS = new Set(["canva.com", "www.canva.com", "canva.link"]);

export function extractSafeCanvaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  // Defesa em profundidade (achado de auditoria adversarial): um Template
  // Link real do Canva nunca tem usuário/senha na URL. Rejeitar aqui
  // elimina de vez o truque clássico de redirect
  // ("https://www.canva.com@evil.com/..." — onde `url.hostname` já dava
  // "evil.com", corretamente rejeitado mesmo sem esta checagem extra) e
  // qualquer URL que, por engano de quem a gerou, carregue credenciais
  // embutidas — nunca repassadas adiante por este validador.
  if (url.username || url.password) return null;
  const isAllowedHost =
    ALLOWED_CANVA_HOSTS.has(url.hostname) || url.hostname.endsWith(".canva.com");
  return isAllowedHost ? value : null;
}
