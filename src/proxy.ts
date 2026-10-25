import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Renova a sessão do Supabase em cada requisição (Fase 4.2.1 — só isso,
 * nenhum redirecionamento nem regra de acesso ainda).
 *
 * Next.js 16 usa `proxy.ts`/`export async function proxy`, não mais
 * `middleware.ts` — confirmado agora na documentação oficial atual do
 * Next.js (nextjs.org/docs/app/api-reference/file-conventions/proxy) e
 * do Supabase antes de escrever este arquivo, já que a versão instalada
 * (`next@16.4.2`) mudou desde a última vez que isso foi pesquisado nesta
 * sessão.
 *
 * `getClaims()`, não `getSession()`/`getUser()`: valida a assinatura do
 * JWT a cada chamada — orientação atual da documentação do Supabase,
 * mais recente que a recomendação de `getUser()` registrada em decisões
 * anteriores do projeto. Confirmado que `getClaims` já existe no
 * `@supabase/auth-js` instalado (dependência do `@supabase/supabase-js`
 * já presente) — não exigiu atualizar nenhuma dependência.
 *
 * Nunca importa `supabase-admin.ts` nem lê `SUPABASE_SERVICE_ROLE_KEY` —
 * só a `anon key`, igual a `src/lib/supabase/server.ts`.
 */
export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // .env.local ainda não existe neste ambiente — sem as duas variáveis,
  // não há como criar o client com segurança. Em vez de travar toda
  // requisição (inclusive os assets estáticos que passam pelo matcher),
  // a requisição segue sem renovar sessão, com um aviso no log do
  // servidor. Nunca inventa um valor nem usa um placeholder aqui.
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      "proxy.ts: NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY " +
        "ausentes — sessão não renovada nesta requisição.",
    );
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Nunca remover esta chamada nem inserir lógica entre createServerClient
  // e getClaims() — qualquer "early return" nesse meio pode deixar a
  // sessão sem renovar, silenciosamente.
  const { data } = await supabase.auth.getClaims();

  // Proteção de rota (Fase 4.3): só decide ir ou não para /login — nunca
  // decide liberação de acesso pago aqui. A liberação de acesso
  // (has_paid_access) é sempre checada depois, dentro de /conta, contra
  // o banco — o proxy só garante que exista uma sessão, não que ela
  // tenha comprado algo.
  const isAccountRoute = request.nextUrl.pathname.startsWith("/conta");
  if (isAccountRoute && !data?.claims) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Precisa ser exatamente este objeto — o último que setAll construiu.
  // Um NextResponse.next() novo aqui perderia os cookies renovados, e o
  // usuário pareceria deslogado na próxima requisição.
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
