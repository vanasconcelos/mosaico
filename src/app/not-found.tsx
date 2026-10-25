import Link from "next/link";
import { Container } from "@/components/ui/Container";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center bg-mosaico-bg py-24">
      <Container>
        <p className="font-sans text-xs font-semibold tracking-[0.2em] text-mosaico-accent-deep uppercase">
          Página não encontrada
        </p>
        <h1 className="mt-3 font-serif text-4xl text-mosaico-ink sm:text-5xl">
          Essa página não existe (ou mudou de lugar).
        </h1>
        <p className="mt-4 max-w-xl text-mosaico-ink-soft">
          Pode ter sido um link antigo ou um endereço digitado errado. Volte ao
          catálogo para encontrar o kit certo.
        </p>
        <Link
          href="/kits"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-mosaico-accent-deep px-7 py-3.5 font-sans text-sm font-semibold tracking-wide text-mosaico-bg uppercase transition-colors hover:bg-mosaico-ink"
        >
          Ver todos os kits
        </Link>
      </Container>
    </main>
  );
}
