import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { TemplatePreview } from "@/components/templates/TemplatePreview";
import { getAllTemplates } from "@/lib/templates";
import { getAllKits, getKitsWithRealContent } from "@/lib/kits";

export const metadata: Metadata = {
  title: "Sobre",
  description:
    "O Mosaico é uma plataforma de templates editáveis no Canva, organizados por kits de nicho profissional — direção de arte pronta, você personaliza.",
};

/**
 * Peça real pro bloco de abertura — nunca a mesma já usada na home.
 * Índice distinto do Hero (3 primeiras do pool elegível) e da
 * BrandVoiceSection (índice 7), pra não repetir a mesma arte na
 * jornada home → sobre. Determinístico (sem Math.random()), mesmo
 * motivo já documentado em PhoneShowcaseSection: evita mismatch de
 * hidratação em SSG.
 */
function pickAboutTemplate() {
  const eligible = getAllTemplates().filter(
    (template) =>
      template.previewImageUrl &&
      (template.category === "Carrossel" || template.category === "Feed"),
  );
  return eligible[15] ?? eligible[0];
}

/** Benefícios com texto só sobre o que é observável no produto — nenhuma
 * estatística inventada, nenhuma promessa de processo que não dá pra
 * confirmar no código (ex.: nunca afirma "revisado por um time", só o
 * que é estruturalmente verdadeiro: peças de um mesmo kit comparti-
 * lham categoria/direção visual). */
const beneficios = [
  {
    titulo: "Praticidade",
    texto:
      "Abra o template no Canva, troque o que for seu — texto, foto, cor — e publique. Sem montar layout do zero.",
  },
  {
    titulo: "Economia de tempo",
    texto:
      "O que levaria uma tarde inteira de tentativa e erro vira minutos de ajuste.",
  },
  {
    titulo: "Identidade visual",
    texto:
      "Cada kit segue uma linha visual própria, pensada pra uma profissão específica — não um pacote genérico de templates soltos.",
  },
  {
    titulo: "Cuidado estético",
    texto:
      "Cada peça de um kit segue a mesma tipografia, cor e composição — nada remendado ou fora do padrão das outras.",
  },
];

export default function SobrePage() {
  const template = pickAboutTemplate();
  const totalTemplates = getAllTemplates().length;
  const kitsPublicados = getKitsWithRealContent().length;
  const totalKits = getAllKits().length;

  return (
    <main>
      {/* Abertura — composição própria desta página: texto + UMA peça
          real (não o leque de 3 do Hero), pra ter identidade visual
          distinta sem romper a linguagem do site. */}
      <section className="bg-mosaico-bg py-20 lg:py-28">
        <Container>
          <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
            <div className="text-center lg:text-left">
              <span className="font-sans text-xs font-semibold tracking-[0.2em] text-mosaico-accent-deep uppercase">
                Sobre o Mosaico
              </span>
              <h1 className="mt-5 font-serif text-4xl leading-[1.12] text-mosaico-ink sm:text-5xl">
                A direção de arte já vem pronta. Você só personaliza.
              </h1>
              <p className="mx-auto mt-5 max-w-md font-sans text-base text-mosaico-ink-soft lg:mx-0">
                O Mosaico reúne kits de templates editáveis no Canva,
                organizados por profissão — pra quem precisa publicar com
                regularidade e não quer recomeçar o design toda vez.
                Pagamento único, acesso permanente aos kits incluídos.
              </p>
            </div>

            {template && (
              <div className="mx-auto w-full max-w-[260px] rotate-2 lg:mx-0 lg:max-w-[300px]">
                <TemplatePreview
                  template={template}
                  placeholderStyle="pending"
                  sizes="(max-width: 1024px) 60vw, 300px"
                  className="overflow-hidden rounded-[3px] border border-mosaico-border/40 shadow-[0_32px_64px_-24px_rgba(23,19,15,0.4)]"
                />
              </div>
            )}
          </div>
        </Container>
      </section>

      <section className="bg-mosaico-bg pt-10 pb-16 lg:pt-14 lg:pb-20">
        <Container>
          <div className="mx-auto max-w-2xl text-center lg:text-left">
            <h2 className="font-serif text-3xl text-mosaico-ink sm:text-4xl">
              O que é o Mosaico
            </h2>
            <p className="mt-5 font-sans text-base text-mosaico-ink-soft">
              Hoje são {totalTemplates} artes, organizadas em{" "}
              {kitsPublicados} kits publicados — de um total de{" "}
              {totalKits} nichos profissionais planejados. Cada kit reúne
              as peças que uma profissão específica mais precisa
              publicar: carrosséis, posts de feed e, em alguns casos,
              apresentações e documentos — todos com a mesma direção de
              arte dentro de cada kit.
            </p>
            <p className="mt-5 font-sans text-base text-mosaico-ink-soft">
              Não é um gerador automático nem um banco de templates
              soltos — é um catálogo curado, onde cada peça já nasce
              coerente com as outras do mesmo kit.
            </p>
          </div>
        </Container>
      </section>

      <section className="bg-mosaico-bg pt-10 pb-16 lg:pt-14 lg:pb-20">
        <Container>
          <div className="mx-auto max-w-2xl text-center lg:text-left">
            <h2 className="font-serif text-3xl text-mosaico-ink sm:text-4xl">
              Como funciona a edição
            </h2>
            <p className="mt-5 font-sans text-base text-mosaico-ink-soft">
              Cada template abre como uma cópia independente sua dentro
              do Canva. Você troca texto, foto e cor sem afetar o modelo
              original — nem o seu, nem o de quem comprou o mesmo kit.
              Não é preciso saber design: a hierarquia, a tipografia e a
              composição já vêm prontas; o que muda é só o conteúdo.
            </p>
          </div>
        </Container>
      </section>

      <section className="bg-mosaico-bg pt-10 pb-16 lg:pt-14 lg:pb-20">
        <Container>
          <h2 className="text-center font-serif text-3xl text-mosaico-ink sm:text-4xl lg:text-left">
            Por que o Mosaico
          </h2>
          <dl className="mt-10 grid gap-x-12 gap-y-10 sm:grid-cols-2">
            {beneficios.map((item) => (
              <div
                key={item.titulo}
                className="border-t border-mosaico-border/20 pt-5"
              >
                <dt className="font-serif text-xl text-mosaico-ink">
                  {item.titulo}
                </dt>
                <dd className="mt-2 font-sans text-sm text-mosaico-ink-soft">
                  {item.texto}
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      {/* Fecho — mesmo padrão já validado em ClosingCtaSection (fundo
          creme contínuo, botão contornado, nunca um bloco de cor
          isolado) — texto próprio desta página, não copiado da home. */}
      <section className="bg-mosaico-bg pt-10 pb-20 lg:pt-14 lg:pb-28">
        <Container>
          <div className="mx-auto max-w-lg text-center">
            <h2 className="font-serif text-3xl text-mosaico-ink sm:text-4xl">
              Encontre o kit da sua área.
            </h2>
            <p className="mx-auto mt-4 max-w-sm font-sans text-base text-mosaico-ink-soft">
              Veja o catálogo completo e descubra o que já está pronto
              pra você personalizar hoje.
            </p>
            <Link
              href="/kits"
              className="mt-7 inline-flex items-center gap-2 rounded-full border border-mosaico-border/40 px-7 py-3.5 font-sans text-sm font-semibold tracking-wide text-mosaico-ink uppercase transition-colors hover:bg-mosaico-ink hover:text-mosaico-bg"
            >
              Ver kits
              <span aria-hidden>→</span>
            </Link>
          </div>
        </Container>
      </section>
    </main>
  );
}
