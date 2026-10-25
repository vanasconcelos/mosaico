import { Container } from "@/components/ui/Container";
import { TemplatePreview } from "@/components/templates/TemplatePreview";
import { TemplateGallery } from "@/components/templates/TemplateGallery";
import { EditInCanvaButton } from "@/components/templates/EditInCanvaButton";
import { DownloadTemplateButton } from "@/components/templates/DownloadTemplateButton";
import type { Template } from "@/types/template";

interface TemplateDetailProps {
  template: Template;
  /** Resolvido no servidor (page.tsx), nunca decidido aqui — se `false`,
   * `signedUrls` é sempre `null` e só a capa segura é mostrada. */
  hasPaidAccess: boolean;
  /** URLs assinadas de curta duração, só preenchidas quando
   * `hasPaidAccess` é `true` e o bucket privado respondeu com sucesso.
   * `null` nunca deve virar um array vazio tratado como "sem páginas". */
  signedUrls: string[] | null;
}

/**
 * Página de um template: o design é o produto, então ele ocupa o lado
 * principal e a maior área — não um preview pequeno cercado de texto.
 * Hierarquia (desktop e mobile): 1) design, 2) nome, 3) informações,
 * 4) CTAs. Nunca lê/expõe `original_canva_url` — só o que já vem em
 * `template` (que nunca carrega esse campo, ver src/types/template.ts).
 *
 * Dois caminhos deliberadamente separados (correção de 2026-09-22, ver
 * docs/mosaico-context.md seção 3): "Baixar modelo pronto" entrega a arte
 * como está, sem tocar no Canva (nunca usa `canvaUrl`); "Editar no Canva"
 * abre o Template Link, que gera cópia independente pro comprador. Nenhum
 * dos dois nunca aponta pro master.
 *
 * Entrega real do conteúdo completo (2026-10-24): nunca lê `canvaUrl` nem
 * `carouselImageUrls`/`previewImageUrl` do mock como fonte do conteúdo
 * pago — ambos vêm resolvidos pelo Server Component (`page.tsx`), que
 * checa sessão + `has_paid_access` contra o Supabase antes de gerar
 * qualquer URL assinada do bucket privado `template-assets`. Sem acesso
 * pago, `signedUrls` é sempre `null` e a página mostra só a capa segura —
 * resolvida por `TemplatePreview` (não aqui, ver src/lib/safe-covers.ts),
 * mesmo caminho usado em todo o resto do catálogo (B4.1, 2026-10-24).
 * `EditInCanvaButton` segue seu próprio caminho (endpoint `edit-link`, já
 * existente) para o Template Link do Canva — nenhuma mudança ali.
 */
export function TemplateDetail({ template, hasPaidAccess, signedUrls }: TemplateDetailProps) {
  const { title, slug, category, description } = template;
  const unlocked = hasPaidAccess && signedUrls && signedUrls.length > 0;

  return (
    <section className="bg-mosaico-bg py-16 lg:py-24">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[1.25fr_1fr] lg:items-start lg:gap-16">
          {/* 1. Design — o produto, lado principal. Só mostra a galeria/
              página completa real quando `unlocked` (resolvido no
              servidor) — sem acesso pago, é sempre a capa segura, nunca a
              galeria com miniaturas clicáveis (evitaria sugerir que há
              mais conteúdo navegável sem ter comprado). */}
          <div className="mx-auto w-full max-w-md lg:mx-0 lg:max-w-none">
            {unlocked ? (
              signedUrls!.length > 1 ? (
                <TemplateGallery
                  title={title}
                  images={signedUrls!}
                  aspectRatio={template.aspectRatio}
                />
              ) : (
                <div
                  style={{ aspectRatio: template.aspectRatio }}
                  className="relative w-full overflow-hidden rounded-[3px] border border-mosaico-border/40 shadow-[0_36px_70px_-32px_rgba(46,25,16,0.4)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={signedUrls![0]} alt={title} className="h-full w-full object-cover" />
                </div>
              )
            ) : (
              <TemplatePreview
                template={template}
                placeholderStyle="pending"
                className="rounded-[3px] border border-mosaico-border/40 shadow-[0_36px_70px_-32px_rgba(46,25,16,0.4)]"
              />
            )}
          </div>

          {/* 2–4. Nome, informações, CTA */}
          <div className="text-center lg:pt-2 lg:text-left">
            {category && (
              <span className="inline-block rounded-full bg-mosaico-accent/15 px-3 py-1 font-sans text-xs font-semibold tracking-[0.12em] text-mosaico-accent-deep uppercase">
                {category}
              </span>
            )}

            <h1 className="mt-4 font-serif text-4xl leading-tight text-mosaico-ink sm:text-5xl">
              {title}
            </h1>

            <p className="mx-auto mt-4 max-w-sm font-sans text-base text-mosaico-ink-soft italic lg:mx-0">
              {description ?? "Descrição a definir."}
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <DownloadTemplateButton title={title} slug={slug} />
              <EditInCanvaButton slug={slug} />
            </div>
            <p className="mx-auto mt-3 max-w-sm font-sans text-xs text-mosaico-ink-soft/70 lg:mx-0">
              Use a arte exatamente como está, ou personalize textos, fotos,
              cores e informações no Canva — sem afetar o modelo original.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
