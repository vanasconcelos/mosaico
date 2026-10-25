import Link from "next/link";
import { Container } from "@/components/ui/Container";

/**
 * Seção D — fecho (revisão 2026-10-20). Antes: um bloco `bg-mosaico-wine`
 * cobrindo a seção inteira, CTA "Encontrar meu kit" — ainda um "bloco de
 * cor isolado". Agora: continua o fundo creme da página, sem retângulo
 * colorido próprio — só título, texto curto e o CTA, modesto. Única
 * função comercial deste CTA (e de todos os outros da home): levar pro
 * catálogo `/kits`, nunca simular checkout.
 */
export function ClosingCtaSection() {
  return (
    <section className="bg-mosaico-bg py-20 lg:py-28">
      <Container>
        <div className="mx-auto max-w-lg text-center">
          <h2 className="font-serif text-3xl text-mosaico-ink sm:text-4xl">
            Pare de recomeçar o design toda semana.
          </h2>
          <p className="mx-auto mt-4 max-w-sm font-sans text-base text-mosaico-ink-soft">
            Cada kit já vem com a direção de arte pronta pra sua área —
            você troca foto, texto e cor pela sua identidade e publica no
            mesmo dia, em vez de montar tudo do zero no Canva.
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
  );
}
