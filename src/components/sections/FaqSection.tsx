import { Container } from "@/components/ui/Container";
import { formatMosaicoPrice } from "@/lib/pricing";

/**
 * Seção nova (2026-10-24) — a home ainda não tinha preço nem FAQ. Segue a
 * mesma decisão de 2026-10-20 contra "blocos de cor isolados"/aparência de
 * vitrine (ver comentários em BrandVoiceSection/page.tsx): texto empilhado,
 * sem cards, sem ícones, sem grid — a mesma lógica editorial do resto da
 * página.
 *
 * As respostas só afirmam o que já está decidido no projeto. Duas coisas
 * deliberadamente fora daqui, por não terem resposta definida ainda: (1)
 * se kits futuros entram no acesso já pago — ainda em aberto; (2) qualquer
 * prazo/forma de pagamento específica, porque o checkout real ainda não
 * está no ar.
 */
const faqItems = [
  {
    question: "Como funciona o acesso aos kits?",
    answer:
      "Pagamento único libera acesso permanente aos kits incluídos no Mosaico — sem mensalidade e sem comprar kit por kit.",
  },
  {
    question: "Onde eu edito os templates?",
    answer:
      "Direto no Canva. Cada template abre como uma cópia independente sua — você troca texto, foto e cor sem afetar o modelo original.",
  },
  {
    question: "Preciso saber design?",
    answer:
      "Não. A direção de arte (tipografia, composição, hierarquia) já vem pronta — você personaliza o conteúdo, não o layout.",
  },
  {
    question: "Quanto custa?",
    answer: `${formatMosaicoPrice()}, em pagamento único.`,
  },
];

export function FaqSection() {
  return (
    <section className="bg-mosaico-bg py-20 lg:py-28">
      <Container>
        <div className="mx-auto max-w-2xl">
          <h2 className="font-serif text-3xl text-mosaico-ink sm:text-4xl">
            Perguntas frequentes
          </h2>
          <dl className="mt-10 divide-y divide-mosaico-border/20">
            {faqItems.map((item) => (
              <div key={item.question} className="py-6">
                <dt className="font-serif text-lg text-mosaico-ink">
                  {item.question}
                </dt>
                <dd className="mt-2 font-sans text-base text-mosaico-ink-soft">
                  {item.answer}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </section>
  );
}
