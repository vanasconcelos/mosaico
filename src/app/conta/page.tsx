import { Container } from "@/components/ui/Container";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "../(auth)/actions";
import { ComprarAcessoButton } from "@/components/conta/ComprarAcessoButton";

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
            <p className="mt-6 font-sans text-base text-mosaico-ink-soft">
              Compra confirmada — acesso liberado. A entrega dos links de
              edição de cada template ainda está sendo preparada.
            </p>
          ) : (
            <>
              <p className="mt-6 font-sans text-base text-mosaico-ink-soft">
                Ainda não identificamos uma compra confirmada nesta conta.
                Compre o acesso completo para editar e baixar qualquer
                template.
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
