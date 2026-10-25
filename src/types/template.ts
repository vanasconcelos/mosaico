/**
 * Entidade de exibição de um template — não é o schema completo do
 * Supabase (ver docs/mosaico-context.md, seção 5): nunca inclui
 * `original_canva_url` (o master, intocável) — só `canvaUrl`, que
 * corresponde ao `canva_editable_url` (Template Link), liberado só após
 * compra confirmada quando o entitlement existir. Nomes de campo em
 * camelCase aqui; o mapeamento para as colunas snake_case do banco
 * (`preview_image_url`, `canva_editable_url`, ...) acontece na camada de
 * dados (ver src/lib/templates.ts), não nos componentes.
 */
export type TemplateCategory =
  | "Feed"
  | "Story"
  | "Carrossel"
  | "Apresentação"
  | "Conteúdo Jurídico";

export type TemplateAspectRatio =
  | "4/5"
  | "3/4"
  | "1/1"
  | "9/16"
  | "16/9"
  | "397/559"
  | "1240/1748"
  | "1414/2000"
  | "1123/1588"
  | "1123/1590"
  | "816/1056";

export interface Template {
  id: string;
  title: string;
  slug: string;
  /** `null` = ainda não definida para este template. */
  category: TemplateCategory | null;
  /** Slug do kit ao qual pertence (kits → packs → templates). `null` =
   * ainda não atribuído. */
  kitSlug: string | null;
  /** Slug do pack. `null` = ainda não atribuído. */
  packSlug: string | null;
  description: string | null;
  /** PNG exportado do master — a capa/página 1 (ver seção 5 do doc de
   * contexto). `null` enquanto o preview real ainda não foi exportado do
   * Canva. Usado em toda miniatura (TemplateCard, grades) mesmo quando o
   * template tem várias páginas. */
  previewImageUrl: string | null;
  /** Páginas de um template com mais de uma peça (ex.: um Carrossel de
   * várias telas). `undefined`/lista vazia = template de página única —
   * TemplateDetail mostra só `previewImageUrl`. Quando existir, a primeira
   * entrada deve ser a mesma imagem de `previewImageUrl`. */
  carouselImageUrls?: string[];
  /** Template Link do Canva ("Link de modelo" — `/view?...&mode=preview`,
   * gera cópia independente ao clicar). NUNCA um link de edição
   * colaborativa (`/edit?...&sharebutton`) e NUNCA o master — ver
   * docs/mosaico-context.md seção 3.3 (correção definitiva, 2026-09-22).
   * `null` = os links finais do Canva ainda não foram fornecidos (ex.:
   * primeiro material de um kit novo, cadastrado antes do link existir) —
   * EditInCanvaButton mostra um estado pendente em vez de um link quebrado
   * ou provisório. Nunca usar uma URL de outro template como placeholder. */
  canvaUrl: string | null;
  aspectRatio: TemplateAspectRatio;
  createdAt: string;
}

/** Formato leve para grades densas onde só a aparência importa (ex.: o
 * showcase decorativo do Hero) — mesma entidade, subconjunto de campos.
 * `aspectRatio` fica opcional aqui (default 4/5 em TemplatePreview) para
 * não obrigar todo mock antigo a declarar o campo. `slug` é obrigatório
 * (pode ser `null` para placeholders decorativos sem template real por
 * trás) — é o que `TemplatePreview` usa para resolver a capa pública
 * segura (ver src/lib/safe-covers.ts), nunca `id`. */
export type TemplateSummary = Pick<
  Template,
  "id" | "title" | "category" | "previewImageUrl"
> & {
  slug: string | null;
} & Partial<Pick<Template, "aspectRatio">>;
