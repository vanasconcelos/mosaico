/**
 * Entidade de kit — topo da hierarquia kits → packs → templates (ver
 * docs/mosaico-context.md, seção 5). `status: "draft"` = kit já definido
 * conceitualmente, mas ainda sem packs/templates reais cadastrados.
 */
export interface Kit {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: "draft" | "published";
}
