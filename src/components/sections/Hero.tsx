import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { TemplatePreview } from "@/components/templates/TemplatePreview";
import { getAllTemplates } from "@/lib/templates";
import { getAllKits, getKitsWithRealContent, kitHasRealContent } from "@/lib/kits";

/**
 * Hero — quarta reescrita (2026-10-20). A versão com `rotateY`/`rotateX`/
 * `preserve-3d` de verdade quebrou visualmente (artefato de
 * clip/sobreposição, texto ilegível) — transformar 3D em cima de imagens
 * com `overflow-hidden`+`border-radius` é frágil demais pra um resultado
 * confiável. Abandonado: volta a um leque 2D simples (só `rotate`),
 * com as 3 peças bem espaçadas (nunca cobrindo o texto uma da outra).
 *
 * `pickHeroCluster`: 3 peças reais de kits distintos, determinístico.
 *
 * Lista de profissões: antes só os 6 kits com conteúdo real — a Ana
 * pediu a lista completa (como as referências, que listam muito mais
 * nichos que packs realmente têm). Usa `getAllKits()` (os 11) — é uma
 * afirmação de POSICIONAMENTO ("pra quem é o Mosaico"), não uma
 * promessa de inventário; o badge numérico (323 artes / 6 kits
 * publicados) continua separado, correto e não lido por essa lista.
 */
function pickHeroCluster() {
  const eligible = getAllTemplates().filter(
    (template) =>
      template.previewImageUrl &&
      (template.category === "Carrossel" || template.category === "Feed"),
  );

  const seenKits = new Set<string>();
  const cluster = [];
  for (const template of eligible) {
    const key = template.kitSlug ?? template.id;
    if (seenKits.has(key)) continue;
    seenKits.add(key);
    cluster.push(template);
    if (cluster.length === 3) break;
  }
  return cluster;
}

export function Hero() {
  const cluster = pickHeroCluster();
  const totalTemplates = getAllTemplates().length;
  const kitsComConteudo = getKitsWithRealContent();
  const todosOsKits = getAllKits();

  return (
    <section className="relative overflow-hidden bg-mosaico-bg py-20 lg:py-28">
      <div className="bg-grid-paper pointer-events-none absolute inset-0" aria-hidden />
      <Container>
        <div className="relative grid items-center gap-16 lg:grid-cols-[0.9fr_1.1fr]">
          {/* Texto — ~45% da largura, nunca centralizado */}
          <div className="relative z-10 text-center lg:text-left">
            <span className="font-sans text-xs font-semibold tracking-[0.2em] text-mosaico-accent-deep uppercase">
              Templates prontos pro Canva
            </span>

            <h1 className="mt-5 max-w-md font-serif text-4xl leading-[1.12] text-mosaico-ink sm:text-5xl">
              Ninguém lê a{" "}
              <span className="italic text-mosaico-accent-deep">legenda</span>{" "}
              antes de julgar o post.
            </h1>

            <p className="mx-auto mt-5 max-w-sm font-sans text-base text-mosaico-ink-soft lg:mx-0">
              O Mosaico existe pra isso: kits de templates com direção de
              arte, organizados por profissão. Troque foto, texto e cor
              pela sua identidade e publique — sem recomeçar o design do
              zero toda semana.
            </p>

            <Link
              href="/kits"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-mosaico-accent-deep px-7 py-3.5 font-sans text-sm font-semibold tracking-wide text-mosaico-bg uppercase transition-colors hover:bg-mosaico-ink"
            >
              Ver kits
              <span aria-hidden>→</span>
            </Link>
          </div>

          {/* Leque 2D — 3 peças reais de kits distintos, espaçadas o
              suficiente pra nenhuma cobrir o texto da outra. Wrapper com
              altura/largura explícitas (sem absolute solto sem
              contenção). */}
          <div className="relative mx-auto h-[380px] w-full max-w-sm sm:h-[420px] lg:mx-0 lg:h-[480px] lg:max-w-none">
            {cluster[1] && (
              <div className="absolute top-0 left-0 w-[46%] -rotate-[10deg] sm:left-[2%] lg:left-[6%]">
                <TemplatePreview
                  template={cluster[1]}
                  placeholderStyle="pending"
                  className="w-full overflow-hidden rounded-[3px] border border-mosaico-border/40 shadow-[0_28px_56px_-24px_rgba(23,19,15,0.4)]"
                />
              </div>
            )}
            {cluster[2] && (
              <div className="absolute right-0 bottom-0 w-[44%] rotate-[9deg] sm:right-[2%] lg:right-[8%]">
                <TemplatePreview
                  template={cluster[2]}
                  placeholderStyle="pending"
                  className="w-full overflow-hidden rounded-[3px] border border-mosaico-border/40 shadow-[0_24px_48px_-22px_rgba(23,19,15,0.35)]"
                />
              </div>
            )}
            {cluster[0] && (
              <div className="absolute top-[12%] left-1/2 z-10 w-[54%] -translate-x-1/2 -rotate-2">
                <span className="absolute -top-7 -right-8 z-10 flex h-20 w-20 flex-col items-center justify-center rounded-full border border-mosaico-border/30 bg-mosaico-bg font-sans text-[10px] leading-tight text-mosaico-ink shadow-[0_18px_36px_-16px_rgba(23,19,15,0.35)] sm:h-24 sm:w-24 sm:text-[11px]">
                  <span className="font-serif text-lg sm:text-xl">{totalTemplates}</span>
                  <span className="text-mosaico-ink-soft">artes</span>
                  <span className="mt-0.5 text-mosaico-ink-soft">
                    {kitsComConteudo.length} kits publicados
                  </span>
                </span>
                <TemplatePreview
                  template={cluster[0]}
                  placeholderStyle="pending"
                  className="w-full overflow-hidden rounded-[3px] border border-mosaico-border/40 shadow-[0_48px_90px_-30px_rgba(23,19,15,0.5)]"
                />
              </div>
            )}
          </div>
        </div>

        {/* Profissões atendidas — os 11 kits (posicionamento de marca,
            "pra quem é o Mosaico"), não só os 6 já publicados. Pills
            alternando claro/escuro, mesmo padrão das referências. Os 5
            ainda sem conteúdo real ganham "· em breve" e um estilo
            tracejado — mesmo sinal honesto já usado no catálogo
            (`KitCatalogCard`), nunca lidos como disponíveis. */}
        <div className="relative mt-16 text-center lg:mt-20 lg:text-left">
          <p className="font-sans text-xs font-semibold tracking-[0.2em] text-mosaico-ink-soft uppercase">
            Feito pra quem trabalha com
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 lg:justify-start">
            {todosOsKits.map((kit, i) => {
              const hasContent = kitHasRealContent(kit.slug);
              return (
                <span
                  key={kit.id}
                  className={
                    !hasContent
                      ? "rounded-full border border-dashed border-mosaico-border/40 bg-mosaico-bg px-4 py-2 font-sans text-xs font-semibold tracking-wide text-mosaico-ink-soft uppercase"
                      : i % 2 === 0
                        ? "rounded-full bg-mosaico-ink px-4 py-2 font-sans text-xs font-semibold tracking-wide text-mosaico-bg uppercase"
                        : "rounded-full border border-mosaico-border/40 bg-mosaico-bg px-4 py-2 font-sans text-xs font-semibold tracking-wide text-mosaico-ink uppercase"
                  }
                >
                  {kit.title}
                  {!hasContent && " · em breve"}
                </span>
              );
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}
