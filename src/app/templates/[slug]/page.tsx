import { notFound } from "next/navigation";
import { getTemplateBySlug } from "@/lib/templates";
import { TemplateDetail } from "@/components/templates/TemplateDetail";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server/supabase-admin";

interface TemplatePageProps {
  params: Promise<{ slug: string }>;
}

const BUCKET = "template-assets";
const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Resolve, server-side, se o visitante atual pode ver o conteúdo completo
 * (todas as páginas, resolução final) deste template. Nunca confia em
 * nada vindo do cliente — mesma checagem de sessão + `has_paid_access`
 * usada em `/conta` e no endpoint `edit-link`. Só gera URLs assinadas
 * (curta duração) depois de confirmar o acesso; quem não tem compra
 * nunca recebe nada do bucket privado nesta resposta — nem no HTML, nem
 * em nenhum estado do cliente.
 */
async function resolvePaidGallery(
  slug: string,
): Promise<{ hasPaidAccess: boolean; signedUrls: string[] | null }> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims) {
    return { hasPaidAccess: false, signedUrls: null };
  }

  const userId = claimsData.claims.sub;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("has_paid_access")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || profile?.has_paid_access !== true) {
    return { hasPaidAccess: false, signedUrls: null };
  }

  const admin = createAdminClient();
  if (!admin) {
    // Sem service_role configurada, não há como gerar signed URL — trata
    // como sem acesso ao conteúdo completo, nunca finge sucesso.
    return { hasPaidAccess: false, signedUrls: null };
  }

  const folder = `templates/${slug}`;
  const { data: arquivos, error: listError } = await admin.storage.from(BUCKET).list(folder);
  if (listError || !arquivos || arquivos.length === 0) {
    return { hasPaidAccess: true, signedUrls: null };
  }

  const ordenados = [...arquivos].sort((a, b) => a.name.localeCompare(b.name));
  const paths = ordenados.map((a) => `${folder}/${a.name}`);

  const { data: assinadas, error: signError } = await admin.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (signError || !assinadas) {
    return { hasPaidAccess: true, signedUrls: null };
  }

  const urls = assinadas
    .map((r) => r.signedUrl)
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  return { hasPaidAccess: true, signedUrls: urls.length > 0 ? urls : null };
}

export default async function TemplatePage({ params }: TemplatePageProps) {
  const { slug } = await params;
  const template = getTemplateBySlug(slug);

  if (!template) {
    notFound();
  }

  const { hasPaidAccess, signedUrls } = await resolvePaidGallery(slug);

  return (
    <TemplateDetail template={template} hasPaidAccess={hasPaidAccess} signedUrls={signedUrls} />
  );
}
