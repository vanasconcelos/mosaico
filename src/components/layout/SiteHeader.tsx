import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/Container";

/**
 * Cabeçalho persistente — vive só em src/app/layout.tsx (layout único do
 * projeto), nunca duplicado em nenhuma página individual.
 *
 * Só decide o rótulo "Entrar"/"Minha conta" a partir de existir sessão
 * (getClaims()) — nunca consulta has_paid_access aqui, não é essa
 * checagem que importa pra um link de cabeçalho, e evitar essa consulta
 * extra (feita de novo, de verdade, em /conta e nas rotas de
 * download/edição) evita uma ida a mais ao banco em toda página. Este
 * componente nunca decide autorização de verdade, só pra onde apontar
 * o link.
 */
export async function SiteHeader() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const hasSession = Boolean(data?.claims);

  return (
    <header className="border-b border-mosaico-border/15 bg-mosaico-bg">
      <Container>
        <div className="flex h-16 items-center justify-between sm:h-20">
          <Link
            href="/"
            className="font-serif text-xl text-mosaico-ink sm:text-2xl"
          >
            Mosaico
          </Link>
          <nav className="flex items-center gap-5 font-sans text-xs font-semibold tracking-wide text-mosaico-ink uppercase sm:gap-8 sm:text-sm">
            {/* `py-3.5` (Fase 4.9, item 3 — alvo de toque do cabeçalho):
                antes a área clicável era só a caixa do texto (~16px de
                altura, medido na auditoria B4.8). Padding vertical só —
                nunca horizontal — expande a área real de clique/toque pra
                ~44px sem mexer no espaçamento entre os links (`gap-5`/
                `gap-8` mede a caixa, não o texto) nem no tamanho visual da
                fonte. Como cada `<Link>` é item de um flex container, o
                padding entra no cálculo da caixa normalmente (flex item
                nunca fica `display: inline`) e o texto continua centralizado
                verticalmente na barra do cabeçalho — mesma posição visual
                de antes, só a área ao redor cresceu. */}
            <Link
              href="/kits"
              className="py-3.5 transition-colors hover:text-mosaico-accent-deep"
            >
              Kits
            </Link>
            {hasSession ? (
              <Link
                href="/conta"
                className="py-3.5 transition-colors hover:text-mosaico-accent-deep"
              >
                Minha conta
              </Link>
            ) : (
              <Link
                href="/login"
                className="py-3.5 transition-colors hover:text-mosaico-accent-deep"
              >
                Entrar
              </Link>
            )}
          </nav>
        </div>
      </Container>
    </header>
  );
}
