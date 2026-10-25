import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server/supabase-admin";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { isValidSlug } from "@/lib/slug";

/**
 * Único lugar que pode devolver `canva_editable_url` a um navegador —
 * a tabela `templates` não tem nenhum GRANT para anon/authenticated
 * (migration 0002), então nem um comprador logado consegue ler essa
 * coluna direto; só o client admin (service_role), e só depois das
 * checagens abaixo. `Cache-Control: private, no-store` pra nunca ficar
 * em cache de CDN/navegador. Nunca loga o link, nem em erro.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Validação de formato primeiro — barata, não depende de sessão,
  // nunca revela se o usuário está autenticado ou não para um slug mal
  // formado.
  if (!isValidSlug(slug)) {
    return NextResponse.json(
      { error: "invalid_slug" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims) {
    return NextResponse.json(
      { error: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const userId = claimsData.claims.sub;

  const rateLimit = checkRateLimit(userId);
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: "too_many_requests" },
      {
        status: 429,
        headers: {
          "Cache-Control": "private, no-store",
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  // Checagem de acesso pelo client do próprio usuário — respeita a RLS
  // `profiles_select_own`, só lê a própria linha.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("has_paid_access")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || profile?.has_paid_access !== true) {
    return NextResponse.json(
      { error: "access_denied" },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "edit_link_not_configured" },
      { status: 501, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const { data: template, error: templateError } = await admin
    .from("templates")
    .select("canva_editable_url")
    .eq("slug", slug)
    .maybeSingle();

  if (templateError) {
    // Só o código, nunca o corpo da resposta nem a URL.
    console.error("edit-link: falha ao consultar template", templateError.code);
    return NextResponse.json(
      { error: "lookup_failed" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  if (!template || !template.canva_editable_url) {
    return NextResponse.json(
      { error: "link_not_available" },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return NextResponse.json(
    { editLink: template.canva_editable_url },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
