#!/usr/bin/env node
// --experimental-strip-types (Node 24+) é necessário pra rodar isto, já
// que src/lib/kits.ts e templates.ts são TypeScript.
/**
 * Migração de `kits` e `templates` do catálogo estático (TypeScript)
 * para o Supabase. NUNCA roda sozinho — precisa de duas coisas
 * explícitas, nenhuma com valor padrão perigoso:
 *
 *   MIGRATION_SOURCE_DIR   Pasta com os kits.ts/templates.ts que têm os
 *                          dados REAIS (links do Canva incluídos). O
 *                          `src/lib/` deste projeto NÃO serve — os
 *                          links ali foram deliberadamente removidos
 *                          (Fase 0 de segurança). Aponte para uma cópia
 *                          de antes dessa correção.
 *   SUPABASE_SERVICE_ROLE_KEY   Nunca em NEXT_PUBLIC_*, nunca commitada.
 *
 * Por padrão roda em modo DRY RUN — só mostra o que faria, não escreve
 * nada. Só grava de verdade com `--execute` explícito na linha de
 * comando.
 *
 * Idempotente por `slug` (kits e templates): já existe uma linha com
 * aquele slug → os campos são atualizados para bater com a fonte;
 * não existe → é criada. Rodar duas vezes seguidas nunca duplica nada
 * (a migration 0001 já garante `slug unique` nas duas tabelas). Isso
 * também significa que rodar de novo SINCRONIZA com a fonte — se um
 * campo mudou no arquivo de origem, a próxima execução atualiza a
 * linha existente. Se você preferir nunca atualizar o que já existe,
 * avise antes da primeira execução autorizada.
 *
 * original_canva_url fica sempre NULL nesta migração — essa coluna
 * nunca existiu no catálogo estático (só canva_editable_url/`canvaUrl`
 * existe lá); preencher original_canva_url exigiria cruzar com outra
 * fonte, fora do escopo desta migração.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const sourceDir = process.env.MIGRATION_SOURCE_DIR;
const execute = process.argv.includes("--execute");

if (!sourceDir) {
  console.error(
    "MIGRATION_SOURCE_DIR não definida. Aponte para a pasta com os " +
      "kits.ts/templates.ts ORIGINAIS (com os links reais) — nunca " +
      "src/lib/ deste projeto, que já teve os links removidos.",
  );
  process.exit(1);
}

// Lê SEMPRE o .env.local deste projeto diretamente — nunca confia em
// variável de ambiente já exportada no shell (que poderia, por engano,
// vir de outro projeto/sessão). Um único lugar define pra qual projeto
// Supabase isto fala, o mesmo arquivo que o site usa.
const envLocalPath = path.join(projectRoot, ".env.local");
let supabaseUrl;
if (existsSync(envLocalPath)) {
  const env = Object.fromEntries(
    readFileSync(envLocalPath, "utf8")
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
  supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
}

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (execute && (!serviceRoleKey || !supabaseUrl)) {
  console.error(
    "--execute pedido, mas SUPABASE_SERVICE_ROLE_KEY (variável de " +
      "ambiente da sessão) ou NEXT_PUBLIC_SUPABASE_URL (.env.local " +
      "deste projeto) não estão definidas. Nada foi gravado.",
  );
  process.exit(1);
}

// Único projeto Supabase de destino autorizado para esta migração — o
// do Mosaico, São Paulo. Nunca o antigo projeto de Oregon, nem
// qualquer outro. Checagem ativa, não só informativa: aborta antes de
// qualquer gravação se o host não bater exatamente com este.
const EXPECTED_SUPABASE_HOST = "irfmkiikyquqjmasmzaj.supabase.co";

if (execute) {
  const actualHost = new URL(supabaseUrl).host;
  console.log(`Projeto Supabase de destino: ${actualHost}`);
  if (actualHost !== EXPECTED_SUPABASE_HOST) {
    console.error(
      `Host inesperado (esperado "${EXPECTED_SUPABASE_HOST}") — abortando sem gravar nada.`,
    );
    process.exit(1);
  }
}

const templatesPath = path.join(path.resolve(sourceDir), "templates.ts");
const kitsPathOriginal = path.join(path.resolve(sourceDir), "kits.ts");

// kits.ts importa `@/lib/templates` (alias do bundler do Next, que não
// existe fora dele) — reescrevemos só essa linha, numa cópia temporária
// fora do projeto, nunca tocando o arquivo original.
const workDir = mkdtempSync(path.join(tmpdir(), "mosaico-migration-"));
const templatesCopy = path.join(workDir, "templates.ts");
writeFileSync(templatesCopy, readFileSync(templatesPath, "utf8"));
const kitsCopy = path.join(workDir, "kits.ts");
writeFileSync(
  kitsCopy,
  readFileSync(kitsPathOriginal, "utf8").replace(
    /["']@\/lib\/templates["']/,
    '"./templates.ts"',
  ),
);

const { getAllTemplates } = await import(templatesCopy);
const { getAllKits } = await import(kitsCopy);

const kits = getAllKits();
const templates = getAllTemplates();

console.log(`Fonte: ${sourceDir}`);
console.log(`Kits: ${kits.length} | Templates: ${templates.length}`);
console.log(execute ? "MODO: EXECUÇÃO REAL" : "MODO: DRY RUN (nada será gravado)");

if (!execute) {
  console.log(
    "\nRode com --execute (e as variáveis de ambiente acima) para gravar de verdade.",
  );
  process.exit(0);
}

// Validação prévia: toda template precisa de um kit correspondente na
// própria fonte — se não validar aqui, o Postgres rejeitaria a escrita
// inteira por violação de NOT NULL em kit_id (atômico, não corrompe
// nada), mas é melhor falhar com uma mensagem clara do que depender
// disso.
const kitSlugsConhecidos = new Set(kits.map((k) => k.slug));
const templatesSemKit = templates.filter((t) => !kitSlugsConhecidos.has(t.kitSlug));
if (templatesSemKit.length > 0) {
  console.error(
    `${templatesSemKit.length} template(s) com kitSlug sem kit correspondente na fonte — abortando sem gravar nada.`,
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Nunca sobrescrever um link real já salvo por um valor vazio — só
// pode acontecer se a fonte apontada for diferente/mais antiga que o
// que já está no banco. Checa ANTES de gravar qualquer coisa.
const slugsDaFonte = templates.map((t) => t.slug);
const { data: existentes, error: existentesError } = await supabase
  .from("templates")
  .select("slug, canva_editable_url")
  .in("slug", slugsDaFonte);

if (existentesError) {
  console.error("Falha ao conferir templates existentes:", existentesError.code);
  process.exit(1);
}

const linkAtualPorSlug = new Map(
  (existentes ?? []).map((t) => [t.slug, t.canva_editable_url]),
);
const perderiaLinkReal = templates.filter((t) => {
  const atual = linkAtualPorSlug.get(t.slug);
  return atual && !t.canvaUrl;
});
if (perderiaLinkReal.length > 0) {
  console.error(
    `${perderiaLinkReal.length} template(s) já têm um link real no banco, mas a fonte não tem um valor — abortando sem gravar nada, pra não apagar um link existente.`,
  );
  process.exit(1);
}

console.log("\nGravando kits...");
const { data: upsertedKits, error: kitsError } = await supabase
  .from("kits")
  .upsert(
    kits.map((k) => ({
      legacy_id: k.id,
      slug: k.slug,
      title: k.title,
      description: k.description,
      status: k.status,
    })),
    { onConflict: "slug" },
  )
  .select("id, slug");

if (kitsError) {
  console.error("Falha ao gravar kits:", kitsError.code, kitsError.message);
  process.exit(1);
}

const kitIdBySlug = new Map(upsertedKits.map((k) => [k.slug, k.id]));

console.log("Gravando templates...");
const { error: templatesError } = await supabase.from("templates").upsert(
  templates.map((t) => ({
    legacy_id: t.id,
    kit_id: kitIdBySlug.get(t.kitSlug),
    pack_id: null,
    slug: t.slug,
    title: t.title,
    description: t.description,
    category: t.category,
    preview_image_url: t.previewImageUrl,
    carousel_image_urls: t.carouselImageUrls ?? null,
    original_canva_url: null,
    canva_editable_url: t.canvaUrl,
    aspect_ratio: t.aspectRatio,
    updated_at: new Date().toISOString(),
  })),
  { onConflict: "slug" },
);

if (templatesError) {
  console.error("Falha ao gravar templates:", templatesError.code, templatesError.message);
  process.exit(1);
}

console.log("\nConcluído.");
