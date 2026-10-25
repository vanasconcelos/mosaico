import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Client de sessão (server) — usa a `anon key` + cookies da requisição,
 * respeita RLS como o usuário autenticado atual (ver Etapa B, seção 04).
 * Nunca a `service_role` — isso é o `supabase-admin.ts`, módulo separado.
 *
 * `getAll`/`setAll` é a única interface de cookies aceita pelo
 * `@supabase/ssr` atual — nunca `get`/`set`/`remove` (API antiga,
 * depreciada). `setAll` pode falhar quando chamado de dentro de um Server
 * Component (cookies só podem ser escritos em Server Actions/Route
 * Handlers) — nesses casos o erro é ignorado aqui; a renovação de sessão
 * nesse caminho é responsabilidade do `proxy.ts` da Fase 4, ainda não
 * criado.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chamado de um Server Component — ver nota acima.
          }
        },
      },
    },
  );
}
