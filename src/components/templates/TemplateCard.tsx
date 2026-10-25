import Link from "next/link";
import type { Template } from "@/types/template";
import { TemplatePreview } from "@/components/templates/TemplatePreview";
import { cx } from "@/lib/cx";

interface TemplateCardProps {
  template: Pick<
    Template,
    "id" | "slug" | "title" | "category" | "previewImageUrl" | "aspectRatio"
  >;
  className?: string;
}

/**
 * Card de catálogo — pensado para listagens futuras (kit, pack, busca),
 * não só para o Template 01. Sem lógica de compra/entitlement aqui: isso
 * fica a cargo de onde o card é usado (ex.: RLS + verificação de
 * `purchases` antes de liberar `canvaUrl` em "Meus Templates").
 */
export function TemplateCard({ template, className }: TemplateCardProps) {
  return (
    <Link
      href={`/templates/${template.slug}`}
      className={cx("group block", className)}
    >
      <TemplatePreview
        template={template}
        placeholderStyle="pending"
        className="rounded-[2px] border border-mosaico-border/40 transition-shadow duration-300 group-hover:shadow-[0_20px_40px_-24px_rgba(46,25,16,0.4)]"
      />
      <div className="mt-3">
        {template.category && (
          <p className="font-sans text-[10px] font-semibold tracking-[0.15em] text-mosaico-accent-deep uppercase">
            {template.category}
          </p>
        )}
        <p className="mt-1 font-serif text-lg text-mosaico-ink">
          {template.title}
        </p>
      </div>
    </Link>
  );
}
