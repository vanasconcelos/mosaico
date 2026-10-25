import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client administrativo — usa `service_role`, ignora RLS inteiramente.
 * Uso restrito aos dois pontos documentados (Etapa B, seção 03): o
 * endpoint de edit-link (Fase 6) e o handler de webhook (Fase 8). Nunca
 * importar fora de código exclusivamente server-side (Route Handlers) —
 * nunca de um componente `"use client"` nem de um módulo que um deles
 * possa importar.
 */
/**
 * `null` sem `SUPABASE_SERVICE_ROLE_KEY` configurada — nunca lança nem
 * usa um valor inventado. Quem chama deve checar `null` e responder de
 * forma honesta (ainda não configurado), igual ao padrão já usado em
 * getMercadoPagoConfig().
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return null;
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
