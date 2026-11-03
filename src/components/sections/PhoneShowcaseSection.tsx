import { Container } from "@/components/ui/Container";
import { PhoneMockup } from "@/components/ui/PhoneMockup";
import { CrossfadeImage } from "@/components/ui/CrossfadeImage";
import { getAllTemplates } from "@/lib/templates";
import { resolveSafeCoverUrl } from "@/lib/safe-covers";

const CELL_COUNT = 12;
const MAX_IMAGES_PER_CELL = 3;

/**
 * Seção B — "prova de qualidade" (quarta versão, 2026-10-20). A terceira
 * versão (dois celulares, um imagem só cada) a Ana achou vazia demais e
 * nem parecia celular de verdade. Ela pediu de volta a sensação da
 * primeira versão: uma vitrine DENSA de templates reais passando dentro
 * do celular — não uma única imagem trocando sozinha.
 *
 * `buildShowcaseGroups`: mesma lógica de `KitCard.buildRealShowcaseGroups`
 * (round-robin por `kitSlug`, até `MAX_IMAGES_PER_CELL` por célula),
 * aplicada aqui a TODOS os kits com conteúdo (não só um) — cada célula do
 * grid de `CELL_COUNT` posições vira um `CrossfadeImage` independente,
 * com intervalo escalonado (`4000 + i*450`), pra não trocarem todas
 * juntas. Exclui `"Apresentação"`/`"Conteúdo Jurídico"` e templates sem
 * `previewImageUrl` — mesmo critério de sempre.
 */
function buildShowcaseGroups(): string[][] {
  const pieces = getAllTemplates()
    .filter(
      (template) =>
        template.previewImageUrl &&
        template.category !== "Apresentação" &&
        template.category !== "Conteúdo Jurídico",
    )
    .map((template) => resolveSafeCoverUrl(template.slug))
    .filter((url): url is string => Boolean(url));

  const groups: string[][] = Array.from({ length: CELL_COUNT }, () => []);
  pieces.forEach((url, i) => {
    const cell = i % CELL_COUNT;
    if (groups[cell].length < MAX_IMAGES_PER_CELL) {
      groups[cell].push(url);
    }
  });

  return groups.filter((group) => group.length > 0);
}

export function PhoneShowcaseSection() {
  const groups = buildShowcaseGroups();

  if (groups.length === 0) return null;

  return (
    <section className="bg-grid-paper relative overflow-hidden bg-mosaico-bg py-20 lg:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -z-0 size-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-mosaico-accent/18 blur-3xl"
      />
      <Container>
        <div className="relative grid items-center gap-14 lg:grid-cols-[0.7fr_1.3fr] lg:gap-6">
          <div className="text-center lg:text-left">
            <p className="font-sans text-xs font-semibold tracking-[0.2em] text-mosaico-accent-deep uppercase">
              Peças reais, não protótipo
            </p>
            <h2 className="mt-3 font-serif text-4xl text-mosaico-ink sm:text-5xl">
              Isto é o que você recebe
            </h2>
            <p className="mx-auto mt-4 max-w-sm font-sans text-base text-mosaico-ink-soft lg:mx-0">
              O mesmo template serve pra qualquer área — é só trocar a
              foto, o texto e a cor pela sua identidade.
            </p>
          </div>

          {/* Celular bem maior (era max-w-[300px], ficava pequeno demais
              numa coluna larga de desktop) — agora cresce com a coluna,
              só limitado pra não estourar em telas muito grandes. */}
          <div className="mx-auto w-full max-w-[260px] rotate-1 sm:max-w-[300px]">
            <PhoneMockup>
              {/* Proporção de tela travada em formato de celular de
                  verdade (bem mais alta que larga) — antes a altura era
                  só o resultado natural do grid de células 4:5, que dava
                  uma tela quase quadrada (lia como tablet, não celular).
                  Agora o container tem `aspect-[9/19]` explícito e cada
                  célula preenche 100% dela (`h-full`, sem aspect
                  próprio) — o recorte de imagem fica por conta do
                  `object-cover` já usado em `CrossfadeImage`. */}
              <div className="grid aspect-[9/19] grid-cols-3 grid-rows-4 gap-[3px] p-[3px]">
                {groups.map((images, i) => (
                  <CrossfadeImage
                    key={i}
                    images={images}
                    alt="Arte real de um kit do Mosaico"
                    intervalMs={4000 + i * 450}
                    sizes="100px"
                    className="h-full w-full"
                  />
                ))}
              </div>
            </PhoneMockup>
          </div>
        </div>
      </Container>
    </section>
  );
}
