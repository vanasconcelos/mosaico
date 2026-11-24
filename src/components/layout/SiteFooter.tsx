import Link from "next/link";
import { Container } from "@/components/ui/Container";

/**
 * Rodapé global — mesmo padrão arquitetural do SiteHeader (Container,
 * Fraunces no nome, Karla no resto da tipografia, paleta já existente).
 * Vive só em src/app/layout.tsx, nunca duplicado numa página individual.
 *
 * Só os links institucionais/legais que já têm página de verdade entram
 * aqui. Reembolso e Contato ficam de fora até existirem — não há nenhum
 * link fictício ou "em breve" no lugar deles.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-mosaico-border/15 bg-mosaico-bg">
      <Container>
        <div className="flex flex-col items-center gap-10 py-14 text-center lg:flex-row lg:items-start lg:justify-between lg:py-20 lg:text-left">
          <div className="max-w-xs">
            <Link
              href="/"
              className="font-serif text-xl text-mosaico-ink sm:text-2xl"
            >
              Mosaico
            </Link>
            <p className="mt-3 font-sans text-sm text-mosaico-ink-soft">
              Kits de templates editáveis no Canva, organizados por
              profissão — pra quem não quer recomeçar o design do zero
              toda semana.
            </p>
          </div>

          <nav
            aria-label="Institucional"
            className="flex flex-col items-center gap-2 font-sans text-sm text-mosaico-ink lg:items-start"
          >
            <p className="font-sans text-xs font-semibold tracking-[0.2em] text-mosaico-ink-soft uppercase">
              Mosaico
            </p>
            <Link
              href="/sobre"
              className="py-1.5 transition-colors hover:text-mosaico-accent-deep"
            >
              Sobre o Mosaico
            </Link>
            <Link
              href="/kits"
              className="py-1.5 transition-colors hover:text-mosaico-accent-deep"
            >
              Kits
            </Link>
            <Link
              href="/politica-de-privacidade"
              className="py-1.5 transition-colors hover:text-mosaico-accent-deep"
            >
              Política de Privacidade
            </Link>
            <Link
              href="/termos-de-uso"
              className="py-1.5 transition-colors hover:text-mosaico-accent-deep"
            >
              Termos de Uso
            </Link>
          </nav>
        </div>
      </Container>
    </footer>
  );
}
