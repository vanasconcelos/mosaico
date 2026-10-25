/**
 * Limite de requisições em memória, por usuário autenticado (nunca por
 * IP — o pedido era especificamente por usuário).
 *
 * IMPORTANTE, não esconder isto: um `Map` em memória só é compartilhado
 * dentro do MESMO processo Node. Em produção numa plataforma serverless
 * (Vercel, que é a cogitada para este projeto), cada instância da
 * função pode rodar em um processo diferente — sob carga, múltiplas
 * instâncias concorrentes têm, cada uma, seu próprio contador, sem
 * coordenação entre elas. Isso significa que o limite real, em
 * produção sob escala horizontal, pode ser maior do que o número
 * configurado aqui (até N vezes maior, N = quantidade de instâncias
 * ativas) — nunca zero, nunca desligado, só menos rígido do que numa
 * única instância. Não é uma falha silenciosa: a checagem sempre roda,
 * sempre nega acima do limite *daquele processo*; só não garante um
 * teto único e global sem um armazenamento compartilhado (ex.: uma
 * tabela no próprio Supabase), que está fora do escopo desta tarefa
 * por exigir uma migration nova.
 *
 * A proteção real contra acesso indevido continua sendo a autenticação
 * e a checagem de `has_paid_access` — isto é só uma camada a mais
 * contra um usuário já autorizado varrendo o catálogo rápido demais.
 */

const WINDOW_MS = 10 * 60 * 1000; // 10 minutos
const MAX_REQUESTS_PER_WINDOW = 30; // generoso para uso real, restritivo pra varredura

type Entry = { count: number; windowStart: number };

const hits = new Map<string, Entry>();

/** Limpa entradas expiradas — evita crescimento ilimitado do Map. */
function cleanup(now: number) {
  for (const [key, entry] of hits) {
    if (now - entry.windowStart > WINDOW_MS) {
      hits.delete(key);
    }
  }
}

export type RateLimitResult =
  | { limited: false }
  | { limited: true; retryAfterSeconds: number };

/**
 * Chamar com um identificador estável do usuário (o `sub` do JWT, nunca
 * o IP). Nunca lança — sempre retorna um resultado, mesmo sob erro
 * inesperado, pra nunca travar o endpoint por causa do limitador.
 */
export function checkRateLimit(userId: string): RateLimitResult {
  const now = Date.now();
  if (hits.size > 10000) {
    // Proteção própria contra o Map crescer sem limite se o cleanup
    // normal não acompanhar — nunca deixa a memória do processo
    // crescer indefinidamente por causa deste módulo.
    cleanup(now);
  }

  const entry = hits.get(userId);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(userId, { count: 1, windowStart: now });
    return { limited: false };
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfterSeconds = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000);
    return { limited: true, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
  }

  entry.count += 1;
  return { limited: false };
}
