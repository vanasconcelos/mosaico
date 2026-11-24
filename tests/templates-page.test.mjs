// Testes isolados de resolvePaidGallery, a função que decide o que a
// página de um template (src/app/templates/[slug]/page.tsx) entrega de
// conteúdo pago. A função em si não é exportada (é interna ao módulo da
// página, de propósito — não existe nenhuma razão de produto pra
// expô-la fora dali), então o teste exercita o comportamento dela da
// mesma forma que um visitante real exercitaria: chamando o componente
// de página exportado (`TemplatePage`, um Server Component async comum,
// chamável como função fora do runtime do Next) e inspecionando as
// props (`hasPaidAccess`, `signedUrls`) do elemento React retornado —
// sem precisar de nenhum renderer/DOM, já que um elemento React nada
// mais é que um objeto simples { type, props }.
//
// @/lib/catalog (Fase 2 — leitor real do catálogo, banco+fallback; antes
// era @/lib/templates direto) é substituído por um fake minúsculo e
// sintético — o conteúdo real do catálogo não é o que está sob teste
// aqui, só a lógica de autorização/signed URLs.
// @/components/templates/TemplateDetail também é substituído por um
// stub inerte: não renderizamos nada, só inspecionamos as props que
// chegam até ele.
//
// Atualizado na Fase 4.12: desde a Fase 4.5, `TemplatePage` não devolve
// mais `<TemplateDetail .../>` diretamente — devolve
// `<Suspense fallback={<TemplateDetailSkeleton .../>}>
//    <TemplateDetailData template={...} slug={...} />
//  </Suspense>`,
// pra que a checagem síncrona de slug/`notFound()` rode FORA de qualquer
// streaming (ver o comentário no próprio page.tsx — é o que garante o
// status HTTP 404 correto pra slug inexistente, validado na Fase 4.5).
// `TemplateDetailData` é o componente async que de fato chama
// `resolvePaidGallery` e só então devolve `<TemplateDetail .../>` com as
// props que os testes abaixo inspecionam. `renderPage` (helper abaixo)
// resolve essa camada extra; nenhuma asserção dos testes precisou mudar
// — só a forma de chegar até as props.

import test from "node:test";
import assert from "node:assert/strict";
import { Suspense } from "react";
import {
  compile,
  injectFakeModule,
  clearModuleCache,
  requireCompiled,
} from "./helpers/compile.mjs";

const PAGE_ENTRY = "src/app/templates/[slug]/page.tsx";

compile([PAGE_ENTRY]);

const TEMPLATE_EXISTENTE = { slug: "template51", title: "Template de teste", kitSlug: "social-media" };

function loadPageWith({
  claims,
  claimsError,
  profile,
  profileError,
  adminAvailable = true,
  listResult,
  signedUrlsResult,
  // Allowlist de distribuição (Fase 4.58) — `true` por padrão, pra todos
  // os testes já existentes (escritos antes da allowlist existir)
  // continuarem exercendo o mesmo comportamento de sempre para
  // "template51". Os testes dedicados à allowlist, abaixo, passam
  // `false` explicitamente.
  distributionAllowed = true,
  // editLinkAvailable (correção de 2026-11-23 — o botão "Editar no
  // Canva" não devia mais aparecer incondicionalmente): `null` por
  // padrão, simulando "link ainda não configurado" — mesmo valor que
  // `canva_editable_url` tem hoje de verdade (banco vazio). Os testes
  // dedicados a isso, abaixo, passam uma string explícita.
  templateCanvaEditableUrl = null,
  templatesQueryError = null,
}) {
  clearModuleCache();
  const calls = {
    profilesQueried: false,
    bucketListed: false,
    signedUrlsRequestedFor: null,
    signedUrlsTtl: null,
    templatesQueried: false,
  };

  injectFakeModule("lib/server/distribution-allowlist", {
    isDistributionAllowed() {
      return distributionAllowed;
    },
  });

  injectFakeModule("lib/catalog", {
    async getTemplateBySlug(slug) {
      return slug === TEMPLATE_EXISTENTE.slug ? TEMPLATE_EXISTENTE : undefined;
    },
    async getAllTemplates() {
      return [TEMPLATE_EXISTENTE];
    },
    async getKitBySlug() {
      return undefined;
    },
  });

  injectFakeModule("components/templates/TemplateDetail", {
    TemplateDetail(props) {
      return { type: "TemplateDetail-stub", props };
    },
  });

  injectFakeModule("lib/supabase/server", {
    async createClient() {
      return {
        auth: {
          async getClaims() {
            if (claimsError) return { data: null, error: claimsError };
            if (!claims) return { data: null, error: null };
            return { data: { claims }, error: null };
          },
        },
        from(table) {
          assert.equal(table, "profiles");
          calls.profilesQueried = true;
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            async maybeSingle() {
              if (profileError) return { data: null, error: profileError };
              return { data: profile, error: null };
            },
          };
        },
      };
    },
  });

  injectFakeModule("lib/server/supabase-admin", {
    createAdminClient() {
      if (!adminAvailable) return null;
      return {
        storage: {
          from(bucket) {
            assert.equal(bucket, "template-assets");
            return {
              async list(folder) {
                calls.bucketListed = true;
                calls.lastFolder = folder;
                if (!listResult) return { data: [], error: null };
                return listResult;
              },
              async createSignedUrls(paths, ttl) {
                calls.signedUrlsRequestedFor = paths;
                calls.signedUrlsTtl = ttl;
                if (!signedUrlsResult) {
                  return {
                    data: paths.map((p) => ({ error: null, path: p, signedURL: `/x/${p}`, signedUrl: `https://fake.test/${p}?token=synthetic` })),
                    error: null,
                  };
                }
                return signedUrlsResult;
              },
            };
          },
        },
        // Consulta de `canva_editable_url` (correção de 2026-11-23) —
        // query builder mínimo, só o suficiente pra `.select().eq().maybeSingle()`
        // encadear como o código real usa.
        from(table) {
          assert.equal(table, "templates");
          calls.templatesQueried = true;
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            async maybeSingle() {
              if (templatesQueryError) return { data: null, error: templatesQueryError };
              return { data: { canva_editable_url: templateCanvaEditableUrl }, error: null };
            },
          };
        },
      };
    },
  });

  return { mod: requireCompiled(PAGE_ENTRY), calls };
}

function notFoundDigestOf(error) {
  return error && error.digest;
}

/**
 * Resolve a página até chegar nas props de `<TemplateDetail>` de verdade
 * (Fase 4.12 — ver nota no topo do arquivo sobre a estrutura com
 * `Suspense` introduzida na Fase 4.5). `TemplatePage` devolve o elemento
 * `<Suspense>`; o conteúdo real só existe depois de EXECUTAR o
 * componente async que é o `children` desse Suspense (`TemplateDetailData`,
 * não exportado — por isso chamado aqui pelo próprio `.type`/`.props` do
 * elemento, nunca importado por nome).
 */
async function renderPage(mod, slug = TEMPLATE_EXISTENTE.slug) {
  const suspenseElement = await mod.default({ params: Promise.resolve({ slug }) });
  const dataElement = suspenseElement.props.children;
  const detailElement = await dataElement.type(dataElement.props);
  return detailElement.props; // { template, hasPaidAccess, signedUrls }
}

// ---------- TEMPLATE INEXISTENTE ----------

test("template inexistente -> aciona notFound(), antes de qualquer checagem de sessão", async () => {
  const { mod, calls } = loadPageWith({ claims: null });
  await assert.rejects(
    () => mod.default({ params: Promise.resolve({ slug: "nao-existe-de-verdade" }) }),
    (err) => notFoundDigestOf(err) === "NEXT_HTTP_ERROR_FALLBACK;404",
  );
  assert.equal(calls.profilesQueried, false, "notFound() deve acontecer antes de qualquer consulta de sessão/perfil");
});

// ---------- ESTRUTURA DO SUSPENSE (Fase 4.12) ----------

test("TemplatePage devolve <Suspense> com TemplateDetailSkeleton como fallback — nunca <TemplateDetail> direto", async () => {
  const { mod } = loadPageWith({ claims: null });
  const suspenseElement = await mod.default({
    params: Promise.resolve({ slug: TEMPLATE_EXISTENTE.slug }),
  });

  assert.equal(
    suspenseElement.type,
    Suspense,
    "o elemento de topo devolvido pela página deve ser um <Suspense> (Fase 4.5) — nunca <TemplateDetail> direto",
  );

  const { TemplateDetailSkeleton } = requireCompiled(
    "src/components/templates/TemplateDetailSkeleton.tsx",
  );
  assert.equal(
    suspenseElement.props.fallback.type,
    TemplateDetailSkeleton,
    "o fallback do Suspense deve ser TemplateDetailSkeleton",
  );
  assert.equal(
    suspenseElement.props.fallback.props.template,
    TEMPLATE_EXISTENTE,
    "o esqueleto recebe o mesmo template já resolvido de forma síncrona, antes de qualquer I/O",
  );

  // O componente async real (`TemplateDetailData`) não é exportado por
  // nome, de propósito — só confirmamos aqui que o `children` do
  // Suspense é uma função recebendo exatamente {template, slug}; o
  // comportamento dela (chamar resolvePaidGallery e devolver
  // <TemplateDetail>) já é exercitado por todos os testes abaixo via
  // `renderPage`.
  const dataElement = suspenseElement.props.children;
  assert.equal(typeof dataElement.type, "function");
  assert.deepEqual(Object.keys(dataElement.props).sort(), ["slug", "template"]);
});

// ---------- VISITANTE SEM SESSÃO ----------

test("visitante sem sessão -> hasPaidAccess: false, signedUrls: null, nunca consulta perfil nem bucket", async () => {
  const { mod, calls } = loadPageWith({ claims: null });
  const props = await renderPage(mod);
  assert.equal(props.hasPaidAccess, false);
  assert.equal(props.signedUrls, null);
  assert.equal(calls.profilesQueried, false);
  assert.equal(calls.bucketListed, false);
});

test("sessão inválida (erro em getClaims) -> tratado igual a 'sem sessão'", async () => {
  const { mod, calls } = loadPageWith({ claimsError: { message: "invalid JWT" } });
  const props = await renderPage(mod);
  assert.equal(props.hasPaidAccess, false);
  assert.equal(props.signedUrls, null);
  assert.equal(calls.profilesQueried, false);
});

// ---------- AUTENTICADO SEM ACESSO PAGO ----------

test("usuário autenticado sem has_paid_access -> hasPaidAccess: false, signedUrls: null, nunca toca o bucket", async () => {
  const { mod, calls } = loadPageWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: false },
  });
  const props = await renderPage(mod);
  assert.equal(props.hasPaidAccess, false);
  assert.equal(props.signedUrls, null);
  assert.equal(calls.bucketListed, false, "sem acesso pago, o bucket nunca deve ser tocado");
});

test("falha ao consultar o perfil -> tratado como sem acesso (fail closed)", async () => {
  const { mod, calls } = loadPageWith({
    claims: { sub: "user-123" },
    profileError: { code: "boom" },
  });
  const props = await renderPage(mod);
  assert.equal(props.hasPaidAccess, false);
  assert.equal(props.signedUrls, null);
  assert.equal(calls.bucketListed, false);
});

// ---------- USUÁRIO COM ACESSO PAGO ----------

test("usuário com acesso pago e arquivos no bucket -> hasPaidAccess: true, signedUrls preenchido e ordenado", async () => {
  const { mod, calls } = loadPageWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    listResult: { data: [{ name: "slide02.png" }, { name: "slide01.png" }], error: null },
  });
  const props = await renderPage(mod);
  assert.equal(props.hasPaidAccess, true);
  assert.deepEqual(props.signedUrls, [
    "https://fake.test/templates/template51/slide01.png?token=synthetic",
    "https://fake.test/templates/template51/slide02.png?token=synthetic",
  ]);
  assert.equal(calls.signedUrlsTtl, 60, "TTL da signed URL deve ser 60 segundos");
  assert.deepEqual(calls.signedUrlsRequestedFor, [
    "templates/template51/slide01.png",
    "templates/template51/slide02.png",
  ]);
});

test("usuário com acesso pago mas bucket vazio -> hasPaidAccess: true, signedUrls: null (nunca inventa URL)", async () => {
  const { mod } = loadPageWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    listResult: { data: [], error: null },
  });
  const props = await renderPage(mod);
  assert.equal(props.hasPaidAccess, true);
  assert.equal(props.signedUrls, null);
});

test("usuário com acesso pago, mas falha ao listar o bucket -> hasPaidAccess: true, signedUrls: null", async () => {
  const { mod } = loadPageWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    listResult: { data: null, error: { message: "internal storage error" } },
  });
  const props = await renderPage(mod);
  assert.equal(props.hasPaidAccess, true);
  assert.equal(props.signedUrls, null);
});

test("usuário com acesso pago, mas falha ao gerar as signed URLs -> hasPaidAccess: true, signedUrls: null, nunca expõe link cru", async () => {
  const { mod } = loadPageWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    listResult: { data: [{ name: "slide01.png" }], error: null },
    signedUrlsResult: { data: null, error: { message: "sign failed" } },
  });
  const props = await renderPage(mod);
  assert.equal(props.hasPaidAccess, true);
  assert.equal(props.signedUrls, null);
});

test("itens sem signedUrl (string vazia/nula) na resposta do Storage são filtrados, nunca repassados como URL válida", async () => {
  const { mod } = loadPageWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    listResult: { data: [{ name: "slide01.png" }, { name: "slide02.png" }], error: null },
    signedUrlsResult: {
      data: [
        { error: null, path: "templates/template51/slide01.png", signedURL: "/x", signedUrl: "https://fake.test/ok" },
        { error: "object not found", path: "templates/template51/slide02.png", signedURL: null, signedUrl: null },
      ],
      error: null,
    },
  });
  const props = await renderPage(mod);
  assert.deepEqual(props.signedUrls, ["https://fake.test/ok"]);
});

test("admin indisponível (sem service_role) -> hasPaidAccess: false, nunca finge sucesso mesmo com acesso pago real", async () => {
  const { mod, calls } = loadPageWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    adminAvailable: false,
  });
  const props = await renderPage(mod);
  assert.equal(props.hasPaidAccess, false);
  assert.equal(props.signedUrls, null);
  assert.equal(calls.bucketListed, false);
});

// ---------- ALLOWLIST DE DISTRIBUIÇÃO (Fase 4.58) ----------

test("slug fora da allowlist -> hasPaidAccess permanece true (reflete a compra real), mas signedUrls: null, sem tocar o bucket", async () => {
  const { mod, calls } = loadPageWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    distributionAllowed: false,
    // Mesmo que o bucket tivesse conteúdo, não deve ser nem consultado.
    listResult: { data: [{ name: "slide01.png" }], error: null },
  });
  const props = await renderPage(mod);
  assert.equal(
    props.hasPaidAccess,
    true,
    "a allowlist nunca deve mentir sobre o status real da compra — só bloqueia a entrega do arquivo",
  );
  assert.equal(props.signedUrls, null);
  assert.equal(calls.bucketListed, false, "fora da allowlist, a galeria nunca deve chegar a listar o bucket");
  assert.equal(calls.signedUrlsRequestedFor, null, "fora da allowlist, nenhuma signed URL deve ser solicitada");
  assert.equal(
    props.downloadAllowed,
    false,
    "fora da allowlist, downloadAllowed deve ser false (Fase 4.60 — esconde o botão de download)",
  );
});

test("slug fora da allowlist e sem sessão -> ainda hasPaidAccess: false (a sessão é checada primeiro, allowlist não muda isso)", async () => {
  const { mod, calls } = loadPageWith({ claims: null, distributionAllowed: false });
  const props = await renderPage(mod);
  assert.equal(props.hasPaidAccess, false);
  assert.equal(props.signedUrls, null);
  assert.equal(calls.bucketListed, false);
  assert.equal(props.downloadAllowed, false);
});

test("slug dentro da allowlist mantém o comportamento normal da galeria (signedUrls preenchido) e downloadAllowed: true", async () => {
  const { mod, calls } = loadPageWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    distributionAllowed: true,
    listResult: { data: [{ name: "slide01.png" }], error: null },
  });
  const props = await renderPage(mod);
  assert.equal(props.hasPaidAccess, true);
  assert.deepEqual(props.signedUrls, ["https://fake.test/templates/template51/slide01.png?token=synthetic"]);
  assert.equal(calls.bucketListed, true);
  assert.equal(
    props.downloadAllowed,
    true,
    "dentro da allowlist, downloadAllowed deve ser true (Fase 4.60 — botão de download aparece)",
  );
});

test("downloadAllowed reflete a allowlist mesmo para visitante sem sessão e sem has_paid_access (decisão independente de quem está vendo)", async () => {
  const semSessaoLiberado = await renderPage(
    loadPageWith({ claims: null, distributionAllowed: true }).mod,
  );
  assert.equal(semSessaoLiberado.downloadAllowed, true);

  const semAcessoBloqueado = await renderPage(
    loadPageWith({
      claims: { sub: "user-123" },
      profile: { has_paid_access: false },
      distributionAllowed: false,
    }).mod,
  );
  assert.equal(semAcessoBloqueado.downloadAllowed, false);
});

// ---------- AUSÊNCIA DE EXPOSIÇÃO ANTES DA AUTORIZAÇÃO ----------

test("nenhum link do bucket chega às props antes de has_paid_access === true (varredura dos 3 cenários negativos)", async () => {
  const cenarios = [
    { claims: null },
    { claims: { sub: "user-123" }, profile: { has_paid_access: false } },
    { claims: { sub: "user-123" }, profileError: { code: "boom" } },
  ];
  for (const cenario of cenarios) {
    const { mod, calls } = loadPageWith(cenario);
    const props = await renderPage(mod);
    assert.equal(props.signedUrls, null);
    assert.equal(calls.bucketListed, false, `bucket não deveria ser tocado no cenário ${JSON.stringify(cenario)}`);
  }
});

// ---------- editLinkAvailable (correção de 2026-11-23 — "Editar no
// Canva" não deve mais aparecer como disponível quando
// canva_editable_url estiver vazio) ----------

test("link ausente (canva_editable_url: null) -> editLinkAvailable: false, mesmo com acesso pago", async () => {
  const { mod, calls } = loadPageWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    templateCanvaEditableUrl: null,
  });
  const props = await renderPage(mod);
  assert.equal(props.editLinkAvailable, false);
  assert.equal(calls.templatesQueried, true);
});

test("link presente, usuário SEM acesso pago -> editLinkAvailable: true (a existência do link é do template, não de quem olha); o bloqueio de verdade é no clique (ver tests/edit-link.test.mjs, 403 access_denied), não mudou", async () => {
  const { mod } = loadPageWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: false },
    templateCanvaEditableUrl: "https://www.canva.com/design/xyz/view",
  });
  const props = await renderPage(mod);
  assert.equal(props.editLinkAvailable, true);
  assert.equal(props.hasPaidAccess, false, "has_paid_access continua false — editLinkAvailable não concede acesso, só diz que o link existe");
});

test("link presente, usuário autorizado e com acesso pago -> editLinkAvailable: true", async () => {
  const { mod } = loadPageWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    templateCanvaEditableUrl: "https://www.canva.com/design/xyz/view",
  });
  const props = await renderPage(mod);
  assert.equal(props.editLinkAvailable, true);
  assert.equal(props.hasPaidAccess, true);
});

test("usuário não autenticado -> editLinkAvailable continua só um booleano, nunca o link (consulta independe de sessão, mas o VALOR real nunca chega às props — só true/false)", async () => {
  const { mod } = loadPageWith({
    claims: null,
    templateCanvaEditableUrl: "https://www.canva.com/design/xyz/view",
  });
  const props = await renderPage(mod);
  assert.equal(typeof props.editLinkAvailable, "boolean");
  assert.equal(props.editLinkAvailable, true);
  assert.equal(props.hasPaidAccess, false, "sessão continua decidindo hasPaidAccess normalmente, independente do link existir");
  // Nunca o valor cru da URL em lugar nenhum das props.
  assert.ok(!JSON.stringify(props).includes("canva.com/design/xyz"));
});

test("erro na consulta de canva_editable_url -> editLinkAvailable: false, nunca lança, nunca apresenta a edição como disponível", async () => {
  const { mod } = loadPageWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    templatesQueryError: { message: "connection refused" },
  });
  const props = await renderPage(mod);
  assert.equal(props.editLinkAvailable, false);
});

test("admin indisponível (sem service_role) -> editLinkAvailable: false, nunca finge disponível", async () => {
  const { mod, calls } = loadPageWith({
    claims: { sub: "user-123" },
    profile: { has_paid_access: true },
    adminAvailable: false,
    templateCanvaEditableUrl: "https://www.canva.com/design/xyz/view",
  });
  const props = await renderPage(mod);
  assert.equal(props.editLinkAvailable, false);
  assert.equal(calls.templatesQueried, false, "sem client admin, nem chega a tentar consultar a tabela");
});
