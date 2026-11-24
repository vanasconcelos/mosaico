import { createClient } from "@/lib/supabase/server";
import type { Template } from "@/types/template";
import type { Kit } from "@/types/kit";

/**
 * Camada de leitura do catálogo a partir do Supabase — PREPARADA, mas
 * deliberadamente NÃO usada por nenhuma página ainda (ver
 * src/lib/templates.ts / src/lib/kits.ts, que continuam sendo a fonte
 * real hoje). Dois motivos concretos, verificados nesta sessão, pra não
 * trocar a chave de leitura das páginas reais:
 *
 *   1. `public.templates`/`public.kits` têm 0 linhas no banco remoto —
 *      trocar agora apagaria o catálogo inteiro da experiência real.
 *   2. `canva_editable_url` nunca existiu preenchido em nenhuma linha,
 *      e mesmo depois de populado nunca é exposto por esta camada: a
 *      view segura `templates_preview` (migration 0002_policies.sql)
 *      deliberadamente NÃO inclui essa coluna — só o endpoint
 *      `/api/templates/[slug]/edit-link` (client admin, depois de
 *      checar sessão + has_paid_access) pode lê-la. `canvaUrl` aqui é
 *      sempre `null`, de propósito, nunca um bug desta camada.
 *
 * Quando o catálogo remoto estiver populado (ver scripts/catalog-seed.sql)
 * e revisado, a troca vira: importar daqui em vez de ./templates.ts/
 * ./kits.ts nos Server Components que hoje usam a fonte estática — as
 * assinaturas de retorno (Template[]/Kit[]) são as mesmas de propósito,
 * só a forma de obter os dados muda, e só async vs sync muda a chamada
 * (`await getAllTemplatesFromDb()` em vez de `getAllTemplates()`).
 *
 * Lê com o client de SESSÃO normal (nunca service_role) — respeita a
 * RLS pública já existente (`kits_select_all`, grant em
 * `templates_preview`), o mesmo acesso que qualquer visitante anônimo
 * já tem hoje no banco real.
 */

export type CatalogDbOutcome<T> =
  | { status: "ok"; data: T }
  | { status: "empty"; data: [] }
  | { status: "error"; error: string };

type TemplatesPreviewRow = {
  id: string;
  kit_id: string | null;
  pack_id: string | null;
  slug: string;
  title: string;
  description: string | null;
  category: Template["category"];
  preview_image_url: string | null;
  carousel_image_urls: string[] | null;
  aspect_ratio: Template["aspectRatio"];
};

type KitRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
};

function mapKitRow(row: KitRow): Kit {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    status: row.status === "published" ? "published" : "draft",
  };
}

/**
 * `kitIdToSlug` resolve o relacionamento kit → template: a view
 * `templates_preview` só expõe `kit_id` (uuid), nunca o slug do kit
 * diretamente (ela não faz join nenhum, de propósito — ver comentário
 * de 0002_policies.sql sobre a view rodar com privilégio do dono só
 * para re-expor colunas de `templates`, nada além disso). Resolver o
 * slug aqui, numa segunda consulta já carregada, evita duplicar essa
 * lógica de join em cada chamador.
 *
 * `createdAt`: a view não expõe essa coluna (não está na lista de
 * SELECT de 0002_policies.sql) — achado real desta sessão, não
 * contornado silenciosamente. Enquanto isso não mudar (exigiria alterar
 * a view, fora do escopo autorizado agora), fica como string vazia;
 * nenhum código hoje ordena por `createdAt` vindo desta camada.
 */
function mapTemplateRow(row: TemplatesPreviewRow, kitIdToSlug: Map<string, string>): Template {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    category: row.category,
    kitSlug: row.kit_id ? (kitIdToSlug.get(row.kit_id) ?? null) : null,
    packSlug: null, // packs nasce vazia hoje (0001_schema.sql) — nenhum template real tem pack_id.
    description: row.description,
    previewImageUrl: row.preview_image_url,
    carouselImageUrls: row.carousel_image_urls ?? undefined,
    canvaUrl: null, // nunca exposto por esta view — ver comentário do módulo.
    aspectRatio: row.aspect_ratio,
    createdAt: "",
  };
}

export async function getAllKitsFromDb(): Promise<CatalogDbOutcome<Kit[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kits")
    .select("id, slug, title, description, status");

  if (error) {
    return { status: "error", error: error.message };
  }
  if (!data || data.length === 0) {
    return { status: "empty", data: [] };
  }
  return { status: "ok", data: data.map(mapKitRow) };
}

export async function getAllTemplatesFromDb(): Promise<CatalogDbOutcome<Template[]>> {
  const supabase = await createClient();

  const [kitsResult, templatesResult] = await Promise.all([
    supabase.from("kits").select("id, slug"),
    supabase
      .from("templates_preview")
      .select(
        "id, kit_id, pack_id, slug, title, description, category, preview_image_url, carousel_image_urls, aspect_ratio",
      ),
  ]);

  if (kitsResult.error) {
    return { status: "error", error: kitsResult.error.message };
  }
  if (templatesResult.error) {
    return { status: "error", error: templatesResult.error.message };
  }
  if (!templatesResult.data || templatesResult.data.length === 0) {
    return { status: "empty", data: [] };
  }

  const kitIdToSlug = new Map<string, string>(
    (kitsResult.data ?? []).map((k: { id: string; slug: string }) => [k.id, k.slug]),
  );

  return {
    status: "ok",
    data: templatesResult.data.map((row: TemplatesPreviewRow) => mapTemplateRow(row, kitIdToSlug)),
  };
}

export async function getTemplateBySlugFromDb(slug: string): Promise<CatalogDbOutcome<Template | null>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("templates_preview")
    .select(
      "id, kit_id, pack_id, slug, title, description, category, preview_image_url, carousel_image_urls, aspect_ratio",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    return { status: "error", error: error.message };
  }
  if (!data) {
    return { status: "empty", data: [] };
  }

  const kitIdToSlug = new Map<string, string>();
  if (data.kit_id) {
    const kitResult = await supabase.from("kits").select("slug").eq("id", data.kit_id).maybeSingle();
    // Achado da auditoria: antes, um erro aqui era silenciosamente
    // ignorado e o template voltava com `kitSlug: null`, como se
    // simplesmente não pertencesse a nenhum kit — indistinguível de uma
    // falha real de consulta. Agora propaga como `status: "error"`,
    // igual ao padrão já usado em getAllTemplatesFromDb.
    if (kitResult.error) {
      return { status: "error", error: kitResult.error.message };
    }
    if (kitResult.data?.slug) kitIdToSlug.set(data.kit_id, kitResult.data.slug);
  }

  return { status: "ok", data: mapTemplateRow(data, kitIdToSlug) };
}

/**
 * Equivalente a `kitHasRealContent`/`getKitsWithRealContent`
 * (src/lib/kits.ts) — usadas por 6 call sites reais (Hero,
 * KitCatalogCard, /sobre, /conta, sitemap.ts). Faltavam nesta camada
 * até a auditoria encontrar a lacuna: sem elas, a documentação do
 * módulo ("mesma assinatura, só troca o import") não era literalmente
 * verdadeira — a troca quebraria 6 arquivos reais por falta de função
 * equivalente, não por incompatibilidade de tipo.
 */
export async function getKitsWithRealContentFromDb(): Promise<CatalogDbOutcome<Kit[]>> {
  const [kitsOutcome, templatesOutcome] = await Promise.all([
    getAllKitsFromDb(),
    getAllTemplatesFromDb(),
  ]);

  if (kitsOutcome.status === "error") return kitsOutcome;
  if (templatesOutcome.status === "error") return templatesOutcome;
  if (kitsOutcome.status === "empty" || templatesOutcome.status === "empty") {
    return { status: "empty", data: [] };
  }

  const kitSlugsComConteudo = new Set(
    templatesOutcome.data.map((template) => template.kitSlug).filter((slug): slug is string => slug !== null),
  );
  const data = kitsOutcome.data.filter((kit) => kitSlugsComConteudo.has(kit.slug));

  return data.length === 0 ? { status: "empty", data: [] } : { status: "ok", data };
}
