import { NextResponse } from "next/server";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server/supabase-admin";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { isValidSlug } from "@/lib/slug";

const BUCKET = "template-assets";

/**
 * Entrega o conteúdo completo de um template (todas as páginas, resolução
 * final) como um .zip montado no servidor — nunca envia URLs individuais
 * nem bytes crus ao cliente antes de confirmar sessão + `has_paid_access`.
 * Mesmo esqueleto de checagem do endpoint `edit-link` (Fase 6): slug válido
 * → sessão → rate limit → `has_paid_access` → só então toca o bucket
 * privado, sempre com o client admin (service_role, ignora RLS, nunca
 * exposto ao cliente).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

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

  // Checagem de acesso pelo client do próprio usuário — respeita RLS
  // `profiles_select_own`, só lê a própria linha. Nunca confia em nada
  // vindo do cliente (header, query string, corpo) para decidir isso.
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
      { error: "download_not_configured" },
      { status: 501, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const folder = `templates/${slug}`;
  const { data: arquivos, error: listError } = await admin.storage.from(BUCKET).list(folder);

  if (listError) {
    console.error("download: falha ao listar bucket", listError.message);
    return NextResponse.json(
      { error: "lookup_failed" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  if (!arquivos || arquivos.length === 0) {
    return NextResponse.json(
      { error: "content_not_available" },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  // Ordem estável (slide01, slide02, ...) — nomes já vêm zero-padded.
  const ordenados = [...arquivos].sort((a, b) => a.name.localeCompare(b.name));

  // Concorrência limitada (Fase 4.11, item 3) — lotes de até
  // DOWNLOAD_BATCH_SIZE arquivos baixados em paralelo por vez, nunca o
  // template inteiro de uma vez (`Promise.all` sem limite) nem um por vez
  // em série (o comportamento anterior, que crescia linearmente com o
  // número de páginas). `Promise.all` dentro de um lote preserva a ordem
  // dos resultados na mesma ordem da entrada (garantia da linguagem,
  // independente de qual download termina primeiro) — por isso a ordem
  // final no .zip continua idêntica a `ordenados`, lote a lote. Qualquer
  // falha dentro de um lote aborta ANTES de `zip.generateAsync()` ser
  // chamado — nenhum .zip parcial chega a ser montado, mesmo que outros
  // arquivos do mesmo lote (ou de lotes já processados) tenham baixado
  // com sucesso.
  const DOWNLOAD_BATCH_SIZE = 4;
  const zip = new JSZip();

  for (let i = 0; i < ordenados.length; i += DOWNLOAD_BATCH_SIZE) {
    const lote = ordenados.slice(i, i + DOWNLOAD_BATCH_SIZE);
    const resultados = await Promise.all(
      lote.map((arquivo) => admin.storage.from(BUCKET).download(`${folder}/${arquivo.name}`)),
    );

    for (let j = 0; j < lote.length; j++) {
      const { data: blob, error: downloadError } = resultados[j];
      if (downloadError || !blob) {
        // Só o código do erro — nunca o caminho completo nem conteúdo.
        console.error("download: falha ao ler objeto do bucket", downloadError?.message);
        return NextResponse.json(
          { error: "lookup_failed" },
          { status: 500, headers: { "Cache-Control": "private, no-store" } },
        );
      }
      const buffer = Buffer.from(await blob.arrayBuffer());
      zip.file(lote[j].name, buffer);
    }
  }

  const zipBytes = await zip.generateAsync({ type: "arraybuffer" });
  const zipBlob = new Blob([zipBytes], { type: "application/zip" });

  return new NextResponse(zipBlob, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
