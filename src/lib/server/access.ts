import { createClient } from "@/lib/supabase/server";

export type AccessState = {
  hasSession: boolean;
  hasPaidAccess: boolean;
};

/**
 * Mesma checagem de sessão + `has_paid_access` já usada de forma inline
 * em `/conta` e em `resolvePaidGallery` (`src/app/templates/[slug]/
 * page.tsx`) — extraída aqui só pra quem decide a navegação de um CTA
 * (ex.: `/kits/[slug]`) não precisar reescrever a mesma query pela
 * terceira vez. Não substitui nem relaxa nenhuma das duas checagens
 * existentes — ambas continuam fazendo a própria verificação, de forma
 * independente, antes de liberar qualquer conteúdo real (nunca confia
 * no resultado desta função pra decidir autorização de verdade, só pra
 * decidir PRA ONDE mandar a pessoa).
 *
 * Usa o client de sessão normal (nunca `service_role`) — respeita a RLS
 * `profiles_select_own`, só lê a própria linha.
 */
export async function resolveAccessState(): Promise<AccessState> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims) {
    return { hasSession: false, hasPaidAccess: false };
  }

  const userId = claimsData.claims.sub;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("has_paid_access")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || profile?.has_paid_access !== true) {
    return { hasSession: true, hasPaidAccess: false };
  }

  return { hasSession: true, hasPaidAccess: true };
}
