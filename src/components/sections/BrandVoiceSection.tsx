import { Container } from "@/components/ui/Container";
import { TemplatePreview } from "@/components/templates/TemplatePreview";
import { getAllTemplates } from "@/lib/templates";

/**
 * Seção C — "voz da marca" (2026-10-20, revisão pós-referências). Substitui
 * `WhatsInsideSection`, que era um bloco `bg-mosaico-ink` cobrindo 100% da
 * largura/altura — exatamente o "retângulo de cor isolado" que a Ana pediu
 * pra tirar. Agora: um card escuro CONTIDO dentro do fundo creme contínuo
 * da página (margem visível ao redor, cantos arredondados) — pontual, não
 * uma seção inteira pintada.
 *
 * A "fotografia real" pedida pela Ana vem de uma peça já cadastrada (o
 * Mosaico não tem banco de fotos de marca próprio — usar uma foto de
 * stock nova seria inventar um ativo que não existe). `pickVoiceTemplate`
 * escolhe uma peça Feed/Carrossel com preview, diferente das já usadas no
 * Hero/colagem (índice 7 do pool elegível), determinístico.
 */
function pickVoiceTemplate() {
  const eligible = getAllTemplates().filter(
    (template) =>
      template.previewImageUrl &&
      (template.category === "Feed" || template.category === "Carrossel"),
  );
  return eligible[7] ?? eligible[0];
}

export function BrandVoiceSection() {
  const template = pickVoiceTemplate();

  return (
    <section className="bg-mosaico-bg py-10 lg:py-16">
      <Container>
        <div className="grid items-center gap-10 rounded-[3px] bg-mosaico-ink p-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:p-16">
          <div className="text-center lg:text-left">
            <h2 className="max-w-md font-serif text-3xl leading-[1.15] text-mosaico-bg sm:text-4xl">
              Seu feed fala antes de você abrir a boca.
            </h2>
            <p className="mx-auto mt-5 max-w-sm font-sans text-base text-mosaico-bg/70 lg:mx-0">
              Um post fora do padrão não é só estético — é o primeiro
              motivo de alguém rolar pra longe antes de ler o que você tem
              a dizer. O Mosaico resolve isso com direção de arte pronta,
              não com sorte.
            </p>
          </div>

          {template ? (
            <div className="mx-auto w-full max-w-[220px] -rotate-2 lg:mx-0">
              <TemplatePreview
                template={template}
                placeholderStyle="pending"
                sizes="220px"
                className="overflow-hidden rounded-[3px] border border-mosaico-bg/15 shadow-[0_32px_64px_-20px_rgba(0,0,0,0.6)]"
              />
            </div>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
