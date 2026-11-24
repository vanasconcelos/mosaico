import type { Template } from "@/types/template";
import type { Kit } from "@/types/kit";
import {
  getAllTemplates as getAllTemplatesStatic,
  getTemplateBySlug as getTemplateBySlugStatic,
} from "@/lib/templates";
import { getAllKits as getAllKitsStatic } from "@/lib/kits";
import {
  getAllTemplatesFromDb,
  getTemplateBySlugFromDb,
  getAllKitsFromDb,
} from "@/lib/server/catalog-db";

/**
 * Ponto único de leitura do catálogo para todas as páginas e componentes
 * — prefere o Supabase real; cai para os dados estáticos
 * (`src/lib/templates.ts`/`kits.ts`) sempre que o banco estiver vazio ou
 * indisponível. Fallback SEGURO de propósito: hoje (banco remoto com 0
 * linhas nas tabelas `kits`/`templates`) toda chamada aqui cai no
 * estático, então o comportamento observável do site é idêntico a antes
 * desta integração — zero risco de regressão enquanto o seed real não
 * for aplicado. No momento em que `scripts/catalog-seed.sql` for
 * aplicado ao banco remoto (ação autorizada separadamente, fora do
 * alcance deste código), estas mesmas funções passam a servir os dados
 * reais do banco, sem precisar tocar em nenhuma página de novo.
 *
 * Nunca mistura fontes dentro de uma mesma chamada: ou toda a resposta
 * vem do banco, ou toda vem do estático — nunca um `Template` com
 * `kitSlug` resolvido pelo banco e outro campo vindo do arquivo local.
 *
 * Erros do banco (`status: "error"`) são tratados como "cair pro
 * estático", nunca propagados como exceção às páginas — mantém o site
 * no ar mesmo que o Supabase esteja temporariamente fora do ar. O erro
 * em si é logado no servidor (nunca exposto ao navegador) para
 * observabilidade.
 *
 * NÃO afeta `src/lib/templates.ts`/`kits.ts` nem os scripts que os leem
 * diretamente (`generate-catalog-seed.mjs`, `import-canva-links.mjs`) —
 * nenhum deles passa por este arquivo.
 *
 * NUNCA filtra por `isDistributionAllowed` (correção de 2026-11-24,
 * "Correção Autorizada do Catálogo" — a versão anterior deste arquivo
 * filtrava `getAllTemplates`/`getTemplateBySlug` pela allowlist de
 * distribuição, o que escondia todo template de toda superfície
 * pública enquanto a allowlist estivesse vazia, confirmado ao vivo no
 * Preview: /kits mostrava 11/11 kits "Em preparação" e o Hero ficava
 * sem nenhuma peça real — regressão em relação ao commit aprovado
 * `8a4a990`). A allowlist de distribuição controla exclusivamente
 * OPERAÇÕES DE DISTRIBUIÇÃO — download (`/api/templates/[slug]/
 * download`) e o flag `downloadAllowed` exibido na página do template
 * (`src/app/templates/[slug]/page.tsx`), ambos checando
 * `isDistributionAllowed` diretamente, sem depender deste módulo.
 * Visibilidade pública (catálogo, página de kit, home, sitemap, página
 * do próprio template) é uma decisão INDEPENDENTE de autorização de
 * distribuição — um template pode aparecer publicamente sem nunca
 * poder ser baixado ou editado, e é exatamente esse o estado atual dos
 * 323 templates.
 */

function logDbFallback(context: string, reason: string) {
  // Log só server-side (nunca chega ao cliente) — útil pra notar quando
  // o banco está vazio/indisponível sem quebrar nada visível.
  console.warn(`catalog: ${context} caiu para dados estáticos (${reason})`);
}

export async function getAllTemplates(): Promise<Template[]> {
  const result = await getAllTemplatesFromDb();
  if (result.status === "ok") return result.data;
  logDbFallback("getAllTemplates", result.status);
  return getAllTemplatesStatic();
}

export async function getTemplateBySlug(slug: string): Promise<Template | undefined> {
  const result = await getTemplateBySlugFromDb(slug);
  if (result.status === "ok") return result.data ?? undefined;
  if (result.status === "error") logDbFallback(`getTemplateBySlug(${slug})`, "error");
  return getTemplateBySlugStatic(slug);
}

export async function getAllKits(): Promise<Kit[]> {
  const result = await getAllKitsFromDb();
  if (result.status === "ok") return result.data;
  logDbFallback("getAllKits", result.status);
  return getAllKitsStatic();
}

export async function getKitBySlug(slug: string): Promise<Kit | undefined> {
  // Sem leitor por-slug dedicado no banco para kits (baixo custo: a
  // tabela de kits é pequena, 11 linhas) — reaproveita getAllKits (já
  // com fallback) e filtra em memória, igual ao padrão estático.
  const kits = await getAllKits();
  return kits.find((kit) => kit.slug === slug);
}

/**
 * Equivalentes a `kitHasRealContent`/`getKitsWithRealContent`
 * (`src/lib/kits.ts`) — mesma regra (pelo menos 1 template real
 * associado), agora resolvendo kits E templates pela MESMA fonte
 * (banco ou estático, nunca uma mistura dos dois).
 */
export async function getKitsWithRealContent(): Promise<Kit[]> {
  const [kits, templates] = await Promise.all([getAllKits(), getAllTemplates()]);
  const kitSlugsComConteudo = new Set(
    templates.map((t) => t.kitSlug).filter((slug): slug is string => slug !== null),
  );
  return kits.filter((kit) => kitSlugsComConteudo.has(kit.slug));
}

export async function kitHasRealContent(kitSlug: string): Promise<boolean> {
  const templates = await getAllTemplates();
  return templates.some((t) => t.kitSlug === kitSlug);
}
