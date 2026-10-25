import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { getKitBySlug } from "@/lib/kits";
import { getAllTemplates } from "@/lib/templates";
import { TemplateCard } from "@/components/templates/TemplateCard";
import { PresentationFolderCard } from "@/components/presentations/PresentationFolderCard";
import { resolveAccessState } from "@/lib/server/access";
import { cx } from "@/lib/cx";

interface KitPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Página do kit — mostra os templates reais já atribuídos a ele
 * (`template.kitSlug === kit.slug`) num grid reaproveitando o mesmo
 * TemplateCard do catálogo. Sem packs ainda (nenhum template tem
 * `packSlug`), então a organização por pack fica pra quando isso existir.
 * Sem templates reais, a seção simplesmente não renderiza o grid — sem
 * selo "Em breve" nem mensagem de "em breve" (removidos a pedido da Ana,
 * 2026-10-13); `kit.status` continua existindo em `Kit`, só o indicador
 * visual saiu daqui.
 *
 * `category: "Apresentação"` sai do grid denso e vira o card-pasta
 * "Apresentações" (pedido explícito da Ana, 2026-09-25 — ver
 * docs/mosaico-context.md): mesmo filtro que o KitCard já usa pra
 * excluir "Apresentação" da vitrine do kit (src/components/kits/
 * KitCard.tsx), reaproveitado aqui como a própria definição do que
 * pertence à pasta. Nenhum template foi criado, duplicado ou teve link
 * alterado — só a exibição muda. Escalável de propósito: um novo
 * template `category: "Apresentação"` neste kit entra na pasta
 * automaticamente, sem editar esta página.
 *
 * `category: "Conteúdo Jurídico"` segue exatamente o mesmo tratamento
 * (pedido explícito da Ana, 2026-10-03): sai do grid denso e vira a
 * pasta "Conteúdo Jurídico", reaproveitando o mesmo PresentationFolderCard
 * (generalizado, não duplicado) e a mesma sub-rota estrutural — ver
 * src/app/kits/[slug]/conteudo-juridico/page.tsx. A pasta de
 * Apresentações do Kit Social Media não foi alterada em comportamento;
 * só ganhou uma irmã que segue o mesmo padrão.
 *
 * CTA comercial (corrigido em 2026-10-25 — antes só rolava até
 * `#conteudo`, sem nenhuma ligação com o checkout que já existe em
 * `/conta`): resolve sessão + `has_paid_access` no servidor
 * (`resolveAccessState`, mesma checagem já usada em `/conta` e na
 * galeria paga de `/templates/[slug]`) e decide entre 3 destinos —
 * nunca decide autorização aqui, só navegação; quem protege de verdade
 * continua sendo `/conta` (recheca `has_paid_access` de novo) e as
 * rotas de download/edição (que nunca dependem desta página). Sem
 * sessão → `/login` com `next` apontando de volta pro próprio kit
 * (`resolveSafeNextPath`, mesma allowlist do resto do site). Com sessão
 * e sem compra → `/conta`, onde já existe "Comprar acesso". Com compra
 * confirmada → mesmo `#conteudo` de sempre (rótulo muda pra não repetir
 * a oferta de compra pra quem já tem acesso). Só aparece quando o kit
 * tem templates reais; kit vazio mostra uma mensagem honesta em vez de
 * um botão sem destino — comportamento inalterado.
 */
export default async function KitPage({ params }: KitPageProps) {
  const { slug } = await params;
  const kit = getKitBySlug(slug);

  if (!kit) {
    notFound();
  }

  const { hasSession, hasPaidAccess } = await resolveAccessState();

  const kitTemplates = getAllTemplates().filter(
    (template) => template.kitSlug === kit.slug,
  );
  const apresentacoes = kitTemplates.filter(
    (template) => template.category === "Apresentação",
  );
  const conteudoJuridico = kitTemplates.filter(
    (template) => template.category === "Conteúdo Jurídico",
  );
  const outrosMateriais = kitTemplates.filter(
    (template) =>
      template.category !== "Apresentação" &&
      template.category !== "Conteúdo Jurídico",
  );
  const folderCount =
    (apresentacoes.length > 0 ? 1 : 0) + (conteudoJuridico.length > 0 ? 1 : 0);
  const hasRealContent = kitTemplates.length > 0;

  return (
    <section className="bg-mosaico-bg py-20 lg:py-28">
      <Container>
        <div className="mx-auto max-w-xl text-center">
          <h1 className="font-serif text-4xl text-mosaico-ink sm:text-5xl">
            Kit {kit.title}
          </h1>
          <p className="mt-4 font-sans text-base text-mosaico-ink-soft">
            {kit.description}
          </p>
          {hasRealContent ? (
            hasPaidAccess ? (
              <a
                href="#conteudo"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-mosaico-accent-deep px-8 py-4 font-sans text-sm font-semibold tracking-wide text-mosaico-bg uppercase transition-colors hover:bg-mosaico-ink"
              >
                Ver meu kit
                <span aria-hidden>↓</span>
              </a>
            ) : hasSession ? (
              <Link
                href="/conta"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-mosaico-accent-deep px-8 py-4 font-sans text-sm font-semibold tracking-wide text-mosaico-bg uppercase transition-colors hover:bg-mosaico-ink"
              >
                Quero meu kit
                <span aria-hidden>→</span>
              </Link>
            ) : (
              <Link
                href={`/login?next=${encodeURIComponent(`/kits/${kit.slug}`)}`}
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-mosaico-accent-deep px-8 py-4 font-sans text-sm font-semibold tracking-wide text-mosaico-bg uppercase transition-colors hover:bg-mosaico-ink"
              >
                Quero meu kit
                <span aria-hidden>→</span>
              </Link>
            )
          ) : (
            <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-mosaico-border/40 px-6 py-3 font-sans text-sm font-semibold tracking-wide text-mosaico-ink-soft uppercase">
              Em preparação — ainda sem peças publicadas
            </p>
          )}
        </div>

        {/* Pastas (Apresentações, Conteúdo Jurídico) — primeiros
            elementos depois do cabeçalho, antes de qualquer template
            individual. A primeira pasta renderizada leva mt-16 (mesmo
            espaçamento do cabeçalho pro grid quando não há pasta
            nenhuma); pastas seguintes levam mt-10, igual ao espaçamento
            entre a última pasta e o grid denso abaixo. `id="conteudo"` no
            wrapper é o alvo do CTA "Ver meu kit" acima, só pra quem já
            tem acesso pago (scroll-margin compensa o espaçamento já
            existente, sem adicionar nenhum). */}
        <div id="conteudo" className="scroll-mt-10">
          {apresentacoes.length > 0 && (
            <PresentationFolderCard
              kitSlug={kit.slug}
              templates={apresentacoes}
              className="mx-auto mt-16 max-w-4xl"
            />
          )}

          {conteudoJuridico.length > 0 && (
            <PresentationFolderCard
              kitSlug={kit.slug}
              templates={conteudoJuridico}
              routeSegment="conteudo-juridico"
              title="Conteúdo Jurídico"
              description="Documentos jurídicos prontos para usar com seus clientes."
              ctaLabel="Ver conteúdo jurídico"
              className={cx(
                "mx-auto max-w-4xl",
                apresentacoes.length > 0 ? "mt-10" : "mt-16",
              )}
            />
          )}

          {outrosMateriais.length > 0 && (
            <div
              className={cx(
                "mx-auto grid max-w-4xl grid-cols-2 gap-8 sm:grid-cols-3",
                folderCount > 0 ? "mt-10" : "mt-16",
              )}
            >
              {outrosMateriais.map((template) => (
                <TemplateCard key={template.id} template={template} />
              ))}
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}
