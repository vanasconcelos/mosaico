import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "../(auth)/actions";
import { ComprarAcessoButton } from "@/components/conta/ComprarAcessoButton";
import { getKitsWithRealContent } from "@/lib/kits";
import { formatMosaicoPrice } from "@/lib/pricing";

/**
 * Página privada (status de compra de uma conta específica) — nunca deve
 * aparecer num resultado de busca. `disallow` no robots.ts impediria o
 * Google de ler esta diretiva (ver comentário em src/app/robots.ts); por
 * isso a página continua rastreável, só marcada aqui.
 */
export const metadata: Metadata = {
  title: "Minha conta",
  robots: { index: false, follow: false },
};

/**
 * Área do comprador — protegida pelo proxy.ts (redireciona pra /login
 * sem sessão). Aqui, além de ter sessão, checamos de verdade
 * `profiles.has_paid_access` contra o banco, usando o client
 * autenticado (respeita a RLS `profiles_select_own` — só lê a própria
 * linha, nunca a de outro usuário). Nunca libera nada só porque a
 * pessoa está logada ou chegou nesta URL.
 *
 * Ainda não entrega nenhum link do Canva aqui — isso é o endpoint
 * /api/templates/[slug]/edit-link, não implementado ainda (depende do
 * webhook gravar compras de verdade primeiro). Esta página só mostra o
 * status real do acesso.
 */
export default async function ContaPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  // O proxy já deveria ter redirecionado sem sessão — isto é defesa em
  // profundidade, não a única proteção.
  if (!claimsData?.claims) {
    return (
      <main className="flex flex-1 items-center bg-mosaico-bg py-20">
        <Container>
          <p className="font-sans text-mosaico-ink-soft">
            Sessão não encontrada.
          </p>
        </Container>
      </main>
    );
  }

  const userId = claimsData.claims.sub;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("has_paid_access")
    .eq("id", userId)
    .maybeSingle();

  const hasPaidAccess = profile?.has_paid_access === true;

  return (
    <main className="flex flex-1 items-center bg-mosaico-bg py-20">
      <Container>
        <div className="mx-auto max-w-lg">
          <p className="font-sans text-xs font-semibold tracking-[0.2em] text-mosaico-accent-deep uppercase">
            Minha conta
          </p>
          <h1 className="mt-3 font-serif text-3xl text-mosaico-ink sm:text-4xl">
            Sua área
          </h1>

          {profileError ? (
            <p className="mt-6 font-sans text-base text-mosaico-ink-soft">
              Não conseguimos confirmar o status da sua conta agora. Tente de
              novo em instantes.
            </p>
          ) : hasPaidAccess ? (
            <>
              <p className="mt-6 font-sans text-base text-mosaico-ink-soft">
                Compra confirmada — acesso liberado. A entrega dos links de
                edição de cada template ainda está sendo preparada.
              </p>
              {/* Lista de kits acessíveis — leitura de getKitsWithRealContent(),
                  já usada em Hero/catálogo; acesso é único e global (não há
                  seleção por kit), então todo kit com conteúdo real entra
                  aqui. Não toca em has_paid_access nem em nenhuma regra de
                  autorização — só navegação para quem já tem acesso. */}
              <div className="mt-8">
                <p className="font-sans text-xs font-semibold tracking-[0.2em] text-mosaico-accent-deep uppercase">
                  Seus kits
                </p>
                <ul className="mt-4 space-y-3">
                  {getKitsWithRealContent().map((kit) => (
                    <li key={kit.id}>
                      <Link
                        href={`/kits/${kit.slug}`}
                        className="font-sans text-base text-mosaico-ink underline decoration-mosaico-border decoration-1 underline-offset-4 transition-colors hover:text-mosaico-accent-deep"
                      >
                        Kit {kit.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <>
              <p className="mt-6 font-sans text-base text-mosaico-ink-soft">
                Ainda não identificamos uma compra confirmada nesta conta.
                Compre o acesso completo para editar e baixar qualquer
                template.
              </p>
              <p className="mt-4 font-serif text-2xl text-mosaico-ink">
                {formatMosaicoPrice()}
                <span className="font-sans text-sm text-mosaico-ink-soft">
                  {" "}
                  — pagamento único
                </span>
              </p>
              <div className="mt-6">
                <ComprarAcessoButton />
              </div>
            </>
          )}

          <form action={logoutAction} className="mt-8">
            <button
              type="submit"
              className="rounded-full border border-mosaico-border/40 px-7 py-3.5 font-sans text-sm font-semibold tracking-wide text-mosaico-ink uppercase transition-colors hover:bg-mosaico-surface"
            >
              Sair
            </button>
          </form>
        </div>
      </Container>
    </main>
  );
}
