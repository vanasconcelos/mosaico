import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "../(auth)/actions";
import { ComprarAcessoButton } from "@/components/conta/ComprarAcessoButton";
import { getKitsWithRealContent } from "@/lib/catalog";
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

interface ContaPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

type CheckoutReturnState = "approved" | "pending" | "failure" | null;

/** Pega o primeiro valor de um parâmetro que pode vir repetido (array) —
 * nunca deixa um `?status=a&status=b` quebrar a leitura. */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Lê só `status`/`collection_status` do retorno do Mercado Pago, nunca
 * `payment_id` (nunca usado como prova de pagamento — ver nota de
 * segurança abaixo). Exige que os dois parâmetros, quando presentes,
 * concordem no MESMO valor — se vierem ausentes, desconhecidos ou
 * contraditórios entre si, retorna `null` (nenhuma mensagem), nunca
 * "aprovado" sem uma evidência única e clara.
 */
function resolveCheckoutReturnState(
  searchParams: Awaited<ContaPageProps["searchParams"]>,
): CheckoutReturnState {
  const values = new Set(
    [firstParam(searchParams.status), firstParam(searchParams.collection_status)].filter(
      (value): value is string => Boolean(value),
    ),
  );
  if (values.size !== 1) {
    return null;
  }
  const [value] = values;
  if (value === "approved") return "approved";
  if (value === "pending" || value === "in_process") return "pending";
  if (value === "rejected" || value === "cancelled") return "failure";
  return null;
}

/**
 * Área do comprador — protegida pelo proxy.ts (redireciona pra /login
 * sem sessão). Aqui, além de ter sessão, checamos de verdade
 * `profiles.has_paid_access` contra o banco, usando o client
 * autenticado (respeita a RLS `profiles_select_own` — só lê a própria
 * linha, nunca a de outro usuário). Nunca libera nada só porque a
 * pessoa está logada ou chegou nesta URL.
 *
 * `status`/`collection_status` na URL (retorno do checkout) só decidem
 * qual AVISO mostrar — nunca o acesso em si. `hasPaidAccess` abaixo
 * continua vindo exclusivamente de `profiles.has_paid_access` no banco,
 * igual já era antes desta mensagem existir.
 *
 * Não entrega nenhum link do Canva diretamente aqui — isso já é
 * responsabilidade de /api/templates/[slug]/edit-link (implementado,
 * testado em tests/edit-link.test.mjs), acessado a partir da página de
 * cada template (TemplateDetail.tsx → EditInCanvaButton/
 * DownloadTemplateButton), não desta tela. Esta página só mostra o
 * status real do acesso e os links para os kits.
 */
export default async function ContaPage({ searchParams }: ContaPageProps) {
  const checkoutReturnState = resolveCheckoutReturnState(await searchParams);

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
  // Só busca quando de fato vai ser exibido — visitante sem acesso nunca
  // precisa desta consulta.
  const kitsComConteudo = hasPaidAccess ? await getKitsWithRealContent() : [];

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

          {checkoutReturnState === "approved" && (
            <p
              role="status"
              aria-live="polite"
              className="mt-6 font-sans text-base text-mosaico-ink-soft"
            >
              Seu pagamento foi aprovado! Estamos atualizando seu acesso. Se
              seus kits ainda não aparecerem, aguarde alguns instantes
              enquanto finalizamos a confirmação.
            </p>
          )}
          {checkoutReturnState === "pending" && (
            <p
              role="status"
              aria-live="polite"
              className="mt-6 font-sans text-base text-mosaico-ink-soft"
            >
              Seu pagamento está em processamento. Assim que a confirmação
              for recebida, seu acesso aos kits será liberado
              automaticamente.
            </p>
          )}
          {checkoutReturnState === "failure" && (
            <p role="alert" className="mt-6 font-sans text-base text-mosaico-red">
              Não foi possível concluir seu pagamento. Você pode tentar
              novamente.
            </p>
          )}

          {profileError ? (
            <p className="mt-6 font-sans text-base text-mosaico-ink-soft">
              Não conseguimos confirmar o status da sua conta agora. Tente de
              novo em instantes.
            </p>
          ) : hasPaidAccess ? (
            <>
              <p className="mt-6 font-sans text-base text-mosaico-ink-soft">
                Compra confirmada — acesso liberado a todo o catálogo do
                Mosaico. Abra qualquer kit abaixo para baixar ou editar cada
                template no Canva.
              </p>
              {/* "complemento, nunca a única forma de entrega" (Fase
                  "Implementação do E-mail de Confirmação de Compra",
                  seção 6) — o acesso já está liberado nesta própria
                  página, independente do e-mail ter chegado ou não;
                  esta linha existe só pra deixar isso explícito pra
                  quem não recebeu (ou ainda não viu) o e-mail. */}
              <p className="mt-2 font-sans text-sm text-mosaico-ink-soft">
                Você também recebe um e-mail de confirmação — mas o acesso
                já está disponível aqui, mesmo que o e-mail demore ou não
                chegue.
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
                  {kitsComConteudo.map((kit) => (
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
                template de qualquer kit do catálogo.
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
