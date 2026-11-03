import { Container } from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Template } from "@/types/template";

interface TemplateDetailSkeletonProps {
  /** `title`/`aspectRatio` do template já são conhecidos quando este
   * esqueleto é montado (ver src/app/templates/[slug]/page.tsx: a busca
   * síncrona do template acontece ANTES do `<Suspense>`, só a parte com
   * I/O real — sessão/Storage — fica dentro dele) — por isso usa a
   * proporção REAL da imagem em vez de um fallback genérico. */
  template: Pick<Template, "title" | "aspectRatio">;
}

/**
 * Esqueleto de `/templates/[slug]` (Fase 4.5) — mesma estrutura de grid/
 * espaçamento de `TemplateDetail.tsx`. Usado como `fallback` de um
 * `<Suspense>` manual dentro de page.tsx, nunca como `loading.tsx` de
 * rota — um `loading.tsx` de rota envolveria a checagem de slug
 * inexistente também, fazendo o Next comprometer o status HTTP como 200
 * antes de saber se a página vai responder 404 (comprovado nesta fase,
 * ver relatório). Com o `<Suspense>` só ao redor da parte lenta (sessão +
 * `has_paid_access` + signed URLs, dentro de `resolvePaidGallery`), a
 * checagem de slug roda fora de qualquer streaming — o 404 continua
 * correto — e só essa parte mostra este esqueleto enquanto resolve.
 */
export function TemplateDetailSkeleton({ template }: TemplateDetailSkeletonProps) {
  return (
    // `<main>` em vez de `<section>` (Fase 4.9, item 2) — mesma troca de
    // `TemplateDetail.tsx` (ver comentário lá): este componente ocupa a
    // mesma posição na árvore enquanto a parte lenta da página resolve,
    // nunca ao mesmo tempo que o conteúdo real — sempre exatamente um
    // `<main>` no DOM.
    <main className="bg-mosaico-bg py-16 lg:py-24" aria-busy="true">
      <Container>
        <div role="status" className="sr-only">
          Carregando {template.title}…
        </div>

        <div
          aria-hidden
          className="grid gap-12 lg:grid-cols-[1.25fr_1fr] lg:items-start lg:gap-16"
        >
          <div className="mx-auto w-full max-w-md lg:mx-0 lg:max-w-none">
            <Skeleton
              style={{ aspectRatio: template.aspectRatio }}
              className="w-full rounded-[3px] border border-mosaico-border/40"
            />
          </div>

          <div className="text-center lg:pt-2 lg:text-left">
            <Skeleton className="mx-auto h-6 w-28 rounded-full lg:mx-0" />

            <Skeleton className="mx-auto mt-5 h-9 w-4/5 lg:mx-0" />
            <Skeleton className="mx-auto mt-3 h-9 w-3/5 lg:mx-0" />

            <Skeleton className="mx-auto mt-5 h-4 w-full max-w-sm lg:mx-0" />
            <Skeleton className="mx-auto mt-2 h-4 w-4/5 max-w-sm lg:mx-0" />

            <Skeleton className="mx-auto mt-6 h-7 w-56 lg:mx-0" />

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Skeleton className="h-[52px] w-56 rounded-full" />
              <Skeleton className="h-[52px] w-48 rounded-full" />
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
}
