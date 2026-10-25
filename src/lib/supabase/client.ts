import { createBrowserClient } from "@supabase/ssr";

/**
 * Client público (browser) — usa a `anon key`, nunca a `service_role`.
 * Toda leitura/escrita feita com ele passa pelas policies de RLS
 * normalmente (ver Etapa B, seção 04). Fase 1: só scaffolding, sem
 * variáveis reais configuradas ainda.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
