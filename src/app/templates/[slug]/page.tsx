import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTemplateBySlug, getKitBySlug } from "@/lib/catalog";
import { resolveSafeCoverUrl } from "@/lib/safe-covers";
import { TemplateDetail } from "@/components/templates/TemplateDetail";
import { TemplateDetailSkeleton } from "@/components/templates/TemplateDetailSkeleton";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server/supabase-admin";
import { isDistributionAllowed } from "@/lib/server/distribution-allowlist";
import type { Template } from "@/types/template";

interface TemplatePageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Metadados do template (Fase 4.3, item 1) — nunca lê `signedUrls`/acesso
 * pago aqui (metadados são públicos por natureza, aparecem até pra quem
 * não comprou); usa só o que já é público: título, descrição e a capa seg
 * ura resolvida por `resolveSafeCoverUrl` (mesma função que já decide o
 * que mostrar a visitantes sem acesso — nunca expõe página do conteúdo
 * pago como imagem de compartilhamento). Descrição cai pra `kit.description`
 * só quando o próprio template não tem a sua (`description: null`) — nunca
 * o texto de preenchimento "Descrição a definir." usado na UI, que não
 * faria sentido num resultado de busca.
 */
export async function generateMetadata({ params }: TemplatePageProps): Promise<Metadata> {
  const { slug } = await params;
  const template = await getTemplateBySlug(slug);
  if (!template) {
    notFound();
  }

  const kit = template.kitSlug ? await getKitBySlug(template.kitSlug) : undefined;
  const description = template.description ?? kit?.description;
  const coverUrl = resolveSafeCoverUrl(template.slug);

  // Mesma ressalva de src/app/kits/[slug]/page.tsx: `description`/
  // `openGraph`/`twitter` só entram no objeto quando têm valor real —
  // definir a chave como `undefined` faz o Next bloquear a herança do
  // metadado equivalente do layout raiz, em vez de herdar normalmente.
  return {
    title: template.title,
    ...(description && { description }),
    ...(coverUrl && {
      openGraph: { images: [{ url: coverUrl }] },
      twitter: { card: "summary_large_image" as const, images: [coverUrl] },
    }),
  };
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

  // Allowlist de distribuição (Fase 4.58) — mesma função usada pelo
  // endpoint de download, checada antes de qualquer custo de Storage.
  // `hasPaidAccess` continua `true` (reflete a compra real, nunca mente
  // sobre isso); só `signedUrls` fica `null` enquanto o slug não estiver
  // liberado — a página mostra a capa segura, igual a quem não comprou,
  // sem fingir que o acesso pago não existe.
  if (!isDistributionAllowed(slug)) {
    return { hasPaidAccess: true, signedUrls: null };
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

/**
 * Só decide SE o botão "Editar no Canva" deve ser oferecido como ação
 * disponível, ou como "em breve" — nunca devolve o link em si, só um
 * booleano (achado da revisão de 2026-11-23: o botão renderizava sempre,
 * incondicionalmente, mesmo quando `canva_editable_url` estava vazio).
 * Mesma coluna, mesmo client admin do endpoint `edit-link` (`templates`
 * não concede SELECT a anon/authenticated — só o client admin lê esta
 * coluna, migration 0002). Independente de `has_paid_access`: a
 * existência do link é propriedade do template, não de quem está
 * olhando — qualquer erro, ausência de linha ou de service_role devolve
 * `false` (fail closed), nunca afirma disponível por omissão.
 */
async function hasEditableLinkConfigured(slug: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;

  const { data, error } = await admin
    .from("templates")
    .select("canva_editable_url")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return false;
  return Boolean(data.canva_editable_url);
}

export default async function TemplatePage({ params }: TemplatePageProps) {
  const { slug } = await params;
  const template = await getTemplateBySlug(slug);

  if (!template) {
    notFound();
  }

  return (
    <Suspense fallback={<TemplateDetailSkeleton template={template} />}>
      <TemplateDetailData template={template} slug={slug} />
    </Suspense>
  );
}

/**
 * Parte com I/O de verdade (sessão + `has_paid_access` + signed URLs)
 * isolada num componente async próprio, dentro de um `<Suspense>` manual
 * (Fase 4.5) — não um `loading.tsx` de rota. Um `loading.tsx` de rota
 * envolveria a função acima inteira, incluindo a checagem de slug: o
 * Next passaria a transmitir (e comprometer o status HTTP como 200) antes
 * de saber se `notFound()` ia ser chamado — comprovado nesta fase
 * isolando o problema (slug inexistente respondia 200 em vez de 404, ver
 * relatório). Com o `<Suspense>` só ao redor desta parte, a checagem de
 * slug em `TemplatePage` roda fora de qualquer streaming — o 404
 * continua exatamente como a Fase 4.3 validou.
 */
async function TemplateDetailData({
  template,
  slug,
}: {
  template: Template;
  slug: string;
}) {
  const [{ hasPaidAccess, signedUrls }, editLinkAvailable] = await Promise.all([
    resolvePaidGallery(slug),
    hasEditableLinkConfigured(slug),
  ]);

  // Mesma allowlist de distribuição (Fase 4.58), só pra decidir se o
  // botão de download aparece na página — nunca uma segunda cópia da
  // regra, a mesma função já usada em resolvePaidGallery e no endpoint
  // de download. Independente de `hasPaidAccess`: a interface nunca
  // oferece um caminho de entrega que o próprio servidor vai recusar,
  // mesmo pra quem comprou.
  const downloadAllowed = isDistributionAllowed(slug);

  return (
    <TemplateDetail
      template={template}
      hasPaidAccess={hasPaidAccess}
      signedUrls={signedUrls}
      downloadAllowed={downloadAllowed}
      editLinkAvailable={editLinkAvailable}
    />
  );
}
