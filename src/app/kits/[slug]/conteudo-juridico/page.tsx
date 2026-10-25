import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { TemplateCard } from "@/components/templates/TemplateCard";
import { getKitBySlug } from "@/lib/kits";
import { getAllTemplates } from "@/lib/templates";

interface ConteudoJuridicoPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Área exclusiva de "Conteúdo Jurídico" de um kit — sub-rota de
 * `/kits/[slug]`, não um kit ou pack novo. Mesma estrutura de
 * `/kits/[slug]/apresentacoes` (pedido explícito da Ana, 2026-10-03: a
 * pasta de Conteúdo Jurídico deve funcionar exatamente como a pasta de
 * Apresentações do Kit Social Media), reaproveitando o mesmo padrão em
 * vez de uma arquitetura paralela. Usa o mesmo filtro que monta o
 * card-pasta na página do kit (`category === "Conteúdo Jurídico"` +
 * `kitSlug`), pra nunca divergir do que a pasta promete conter — nenhum
 * dado de template é duplicado ou reclassificado, só a exibição muda.
 * Genérica de propósito (não hardcoded pro Kit Institucional
 * Advocacia): qualquer kit que ganhe templates `category: "Conteúdo
 * Jurídico"` no futuro passa a ter essa área automaticamente, sem
 * alteração de código.
 *
 * 404 se o kit não existe ou se não há nenhum conteúdo jurídico
 * cadastrado — o card-pasta em `/kits/[slug]` só aparece quando há pelo
 * menos um, então chegar aqui sem nenhum só pode ser um link direto
 * obsoleto.
 */
export default async function ConteudoJuridicoPage({
  params,
}: ConteudoJuridicoPageProps) {
  const { slug } = await params;
  const kit = getKitBySlug(slug);

  if (!kit) {
    notFound();
  }

  const conteudoJuridico = getAllTemplates().filter(
    (template) =>
      template.kitSlug === kit.slug &&
      template.category === "Conteúdo Jurídico",
  );

  if (conteudoJuridico.length === 0) {
    notFound();
  }

  return (
    <section className="bg-mosaico-bg py-20 lg:py-28">
      <Container>
        <Link
          href={`/kits/${kit.slug}`}
          className="inline-flex items-center gap-2 font-sans text-sm font-semibold text-mosaico-accent-deep hover:text-mosaico-ink"
        >
          <span aria-hidden>←</span>
          Voltar ao Kit {kit.title}
        </Link>

        <div className="mx-auto mt-8 max-w-xl text-center">
          <span className="inline-block rounded-full bg-mosaico-accent/15 px-3 py-1 font-sans text-[10px] font-semibold tracking-[0.15em] text-mosaico-accent-deep uppercase">
            Coleção
          </span>
          <h1 className="mt-4 font-serif text-4xl text-mosaico-ink sm:text-5xl">
            Conteúdo Jurídico
          </h1>
          <p className="mt-4 font-sans text-base text-mosaico-ink-soft">
            Documentos jurídicos prontos para usar com seus clientes.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-8 motion-safe:animate-[mosaico-reveal_0.5s_ease-out_1_both] sm:grid-cols-3">
          {conteudoJuridico.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      </Container>
    </section>
  );
}
