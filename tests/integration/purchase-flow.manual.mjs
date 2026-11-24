#!/usr/bin/env node
// Ensaio integrado do fluxo comercial completo (Etapa 2.3).
//
// NÃO faz parte da suíte automática (`npm test`) de propósito — depende
// de um Postgres 17 descartável via Docker (mesmo padrão já usado em
// tests/sql/verify-apply-purchase-event.sql), que nem sempre está
// disponível. Por isso o nome deste arquivo NÃO termina em `.test.mjs`
// (o padrão que `node --test` descobre automaticamente) — precisa ser
// chamado explicitamente:
//
//   node tests/integration/purchase-flow.manual.mjs
//
// O que é REAL nesta cadeia, diferente de todos os outros testes deste
// projeto: as rotas compiladas (checkout, webhook, download) são as
// mesmas .ts verdadeiras; a validação de assinatura HMAC é real; o
// mapeamento de status é real; e — a parte nova — `admin.rpc(...)` e a
// leitura de `profiles.has_paid_access` são *de fato* executadas contra
// um PostgreSQL 17 real (as mesmas 3 funções de
// supabase/migrations/0007, aplicadas aqui exatamente como estão),
// via uma ponte que troca só o transporte HTTP (PostgREST, que este
// ambiente não tem) por `docker exec psql` — o contrato observável
// (parâmetros enviados, formato da resposta) é idêntico ao do client
// real do @supabase/supabase-js.
//
// O que continua mockado, de propósito, por não ser o foco desta etapa
// (e já estar coberto em detalhe nas Etapas 2.2B/2.2C): a API do
// Mercado Pago (nunca uma chamada de rede real, nunca uma credencial
// real) e o Supabase Storage (bucket/arquivos — já teve sua própria
// bateria de testes completa com JSZip real na Etapa 2.2B).
//
// Pré-requisito: um container chamado "mosaico-audit-pg" (postgres:17,
// descartável) já em execução, com o schema desta auditoria aplicado
// (profiles/purchases + as 3 funções de 0007, service_role com LOGIN
// só neste ambiente de teste). Ver o relatório da Etapa 2.3 para o
// script de setup usado.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  compile,
  injectFakeModule,
  clearModuleCache,
  requireCompiled,
} from "../helpers/compile.mjs";

const require = createRequire(import.meta.url);
const CONTAINER = "mosaico-audit-pg";

// ---------- ponte real para o Postgres descartável ----------

function sqlLiteral(value, cast) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  const escaped = String(value).replace(/'/g, "''");
  return cast ? `'${escaped}'::${cast}` : `'${escaped}'`;
}

function runSql(sql, { role = "postgres" } = {}) {
  return execFileSync(
    "docker",
    ["exec", "-u", "postgres", CONTAINER, "psql", "-U", role, "-d", "testdb", "-t", "-A", "-F", "\t", "-c", sql],
    { encoding: "utf8" },
  );
}

/** Confirma que o container de teste está de pé antes de prosseguir. */
function assertContainerReady() {
  try {
    execFileSync("docker", ["exec", CONTAINER, "pg_isready", "-U", "postgres"], { stdio: "ignore" });
  } catch {
    throw new Error(
      `Container "${CONTAINER}" não está acessível. Este ensaio exige um Postgres 17 descartável ` +
        "já configurado (ver relatório da Etapa 2.3) — não inicia nem configura nada sozinho.",
    );
  }
}

function insertProfile(id, email) {
  runSql(`insert into profiles (id, email) values (${sqlLiteral(id, "uuid")}, ${sqlLiteral(email)});`);
}

function readHasPaidAccess(userId) {
  const out = runSql(`select has_paid_access from profiles where id = ${sqlLiteral(userId, "uuid")};`).trim();
  return out === "t";
}

function readPurchase(providerEventId) {
  const out = runSql(
    `select user_id, status, amount_cents from purchases where provider_event_id = ${sqlLiteral(providerEventId)};`,
  ).trim();
  if (!out) return null;
  const [user_id, status, amount] = out.split("\t");
  return { user_id, status, amount_cents: amount === "" ? null : Number(amount) };
}

function countPurchasesFor(providerEventId) {
  return Number(runSql(`select count(*) from purchases where provider_event_id = ${sqlLiteral(providerEventId)};`).trim());
}

/**
 * Ponte real de admin.rpc("apply_purchase_event", params) — monta e
 * executa a MESMA chamada SQL que o @supabase/supabase-js real faria
 * via PostgREST, só trocando o transporte. Conectada como service_role
 * (LOGIN só neste ambiente de teste), nunca como postgres/app_owner —
 * exatamente o papel que o client admin usa em produção.
 */
function realApplyPurchaseEventRpc(params) {
  const sql =
    `select apply_purchase_event(` +
    `${sqlLiteral(params.p_user_id, "uuid")}, ` +
    `${sqlLiteral(params.p_provider)}, ` +
    `${sqlLiteral(params.p_provider_event_id)}, ` +
    `${sqlLiteral(params.p_provider_event_at, "timestamptz")}, ` +
    `${sqlLiteral(params.p_status)}, ` +
    `${params.p_amount_cents === null || params.p_amount_cents === undefined ? "NULL" : params.p_amount_cents}` +
    `);`;
  try {
    const out = runSql(sql, { role: "service_role" }).trim();
    return { data: out === "t", error: null };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : String(err.message);
    return { data: null, error: { message: stderr.split("\n")[0] } };
  }
}

// ---------- fakes reutilizáveis, compartilhando o mesmo Postgres real ----------

function fakeSessionClientFor(claims) {
  return {
    auth: {
      async getClaims() {
        if (!claims) return { data: null, error: null };
        return { data: { claims }, error: null };
      },
    },
    from(table) {
      assert.equal(table, "profiles", "o client de sessão só deve consultar 'profiles'");
      return {
        select() {
          return this;
        },
        eq(_col, id) {
          this._id = id;
          return this;
        },
        async maybeSingle() {
          const out = runSql(`select has_paid_access from profiles where id = ${sqlLiteral(this._id, "uuid")};`).trim();
          if (out === "") return { data: null, error: null };
          return { data: { has_paid_access: out === "t" }, error: null };
        },
      };
    },
  };
}

function installRealAdminRpcFake({ storageFake } = {}) {
  const rpcCalls = [];
  injectFakeModule("lib/server/supabase-admin", {
    createAdminClient() {
      return {
        from(table) {
          throw new Error(`regressão: a rota chamou admin.from("${table}") direto — deveria usar só rpc()/storage`);
        },
        storage: storageFake,
        rpc(fn, params) {
          assert.equal(fn, "apply_purchase_event");
          rpcCalls.push(params);
          return Promise.resolve(realApplyPurchaseEventRpc(params));
        },
      };
    },
  });
  return rpcCalls;
}

// ---------- assinatura HMAC real (mesmo esquema de route.ts) ----------

const WEBHOOK_SECRET = "integration-test-secret-synthetic";

function signWebhook(dataId, requestId, ts) {
  const template = `id:${dataId};request-id:${requestId};ts:${ts};`;
  return createHmac("sha256", WEBHOOK_SECRET).update(template).digest("hex");
}

function makeWebhookRequest({ dataId, requestId = "req-integration", validSignature = true }) {
  const ts = String(Date.now());
  const url = `http://localhost/api/webhooks/mercadopago?data.id=${encodeURIComponent(dataId)}`;
  const headers = { "x-request-id": requestId };
  if (validSignature) {
    headers["x-signature"] = `ts=${ts},v1=${signWebhook(dataId, requestId, ts)}`;
  } else {
    headers["x-signature"] = `ts=${ts},v1=assinatura-deliberadamente-errada`;
  }
  return new Request(url, { method: "POST", headers });
}

// ---------- ambiente ----------

const CHECKOUT_ENTRY = "src/app/api/checkout/route.ts";
const WEBHOOK_ENTRY = "src/app/api/webhooks/mercadopago/route.ts";
const DOWNLOAD_ENTRY = "src/app/api/templates/[slug]/download/route.ts";

assertContainerReady();

compile([CHECKOUT_ENTRY, "src/lib/server/mercadopago.ts", "src/lib/pricing.ts"]);
compile([WEBHOOK_ENTRY, "src/lib/server/mercadopago.ts", "src/lib/pricing.ts"]);
compile([DOWNLOAD_ENTRY, "src/lib/slug.ts"]);

const ORIGINAL_ENV = { ...process.env };
function setSyntheticEnv() {
  process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-synthetic-integration-token";
  process.env.MERCADOPAGO_ENV = "test";
  process.env.MERCADOPAGO_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  delete process.env.VERCEL_ENV;
  delete process.env.NODE_ENV;
}
function restoreEnv() {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
}
test.after(() => restoreEnv());

const USER_ID = randomUUID();
const OUTRO_USER_SEM_COMPRA = randomUUID();
insertProfile(USER_ID, "comprador@example.test");
insertProfile(OUTRO_USER_SEM_COMPRA, "nunca-comprou@example.test");

let dataIdAprovado;

// ---------- 1. autenticação + checkout ----------

test("1. usuário autenticado inicia checkout -> preference criada com preço do servidor e external_reference = id da sessão", async () => {
  setSyntheticEnv();
  clearModuleCache();
  injectFakeModule("lib/supabase/server", { async createClient() { return fakeSessionClientFor({ sub: USER_ID }); } });

  const mercadopago = require("mercadopago");
  const originalCreate = mercadopago.Preference.prototype.create;
  let captured = null;
  mercadopago.Preference.prototype.create = async function (args) {
    captured = args;
    return { init_point: "https://example-test.invalid/checkout/synthetic" };
  };

  const mod = requireCompiled(CHECKOUT_ENTRY);
  const res = await mod.POST();
  mercadopago.Preference.prototype.create = originalCreate;

  assert.equal(res.status, 200);
  assert.equal(captured.body.external_reference, USER_ID, "external_reference deve ser exatamente o id do usuário autenticado");
  assert.equal(captured.body.items[0].unit_price, 147.9, "preço deve vir só do servidor (MOSAICO_PRICE_CENTS)");
  assert.equal(captured.body.items[0].currency_id, "BRL");
});

// ---------- 2. webhook: assinatura inválida ----------

test("2. webhook com assinatura inválida -> 401, apply_purchase_event REAL nunca é chamado, nenhuma linha gravada", async () => {
  setSyntheticEnv();
  clearModuleCache();
  const rpcCalls = installRealAdminRpcFake();
  const dataId = `pay-sig-invalida-${randomUUID()}`;

  const mod = requireCompiled(WEBHOOK_ENTRY);
  const res = await mod.POST(makeWebhookRequest({ dataId, validSignature: false }));
  assert.equal(res.status, 401);
  assert.equal(rpcCalls.length, 0);
  assert.equal(countPurchasesFor(dataId), 0, "nenhuma linha deve existir no Postgres real");
});

// ---------- 3. pagamento aprovado -> SQL real grava, has_paid_access real vira true ----------

test("3. webhook com assinatura válida, pagamento aprovado -> apply_purchase_event REAL grava 'paid', has_paid_access REAL vira true", async () => {
  setSyntheticEnv();
  clearModuleCache();
  const rpcCalls = installRealAdminRpcFake();
  dataIdAprovado = `pay-aprovado-${randomUUID()}`;

  const mercadopago = require("mercadopago");
  const originalGet = mercadopago.Payment.prototype.get;
  mercadopago.Payment.prototype.get = async function () {
    return {
      status: "approved",
      external_reference: USER_ID,
      transaction_amount: 147.9,
      date_approved: "2026-11-01T12:00:00.000Z",
    };
  };

  const mod = requireCompiled(WEBHOOK_ENTRY);
  const res = await mod.POST(makeWebhookRequest({ dataId: dataIdAprovado }));
  mercadopago.Payment.prototype.get = originalGet;

  assert.equal(res.status, 200);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].p_user_id, USER_ID, "a função SQL deve receber o MESMO user id usado no checkout (passo 1)");
  assert.equal(rpcCalls[0].p_status, "paid");
  assert.equal(rpcCalls[0].p_amount_cents, 14790);

  // Confirmado direto no Postgres real, não no mock:
  const row = readPurchase(dataIdAprovado);
  assert.equal(row.status, "paid");
  assert.equal(row.user_id, USER_ID);
  assert.equal(readHasPaidAccess(USER_ID), true);
});

// ---------- 4. evento duplicado ----------

test("4. mesmo evento (mesmo data.id) reenviado -> idempotente no Postgres real, nenhuma linha duplicada", async () => {
  setSyntheticEnv();
  clearModuleCache();
  installRealAdminRpcFake();

  const mercadopago = require("mercadopago");
  const originalGet = mercadopago.Payment.prototype.get;
  mercadopago.Payment.prototype.get = async function () {
    return { status: "approved", external_reference: USER_ID, transaction_amount: 147.9, date_approved: "2026-11-01T12:00:00.000Z" };
  };

  const mod = requireCompiled(WEBHOOK_ENTRY);
  const res = await mod.POST(makeWebhookRequest({ dataId: dataIdAprovado, requestId: "req-integration-replay" }));
  mercadopago.Payment.prototype.get = originalGet;

  assert.equal(res.status, 200);
  assert.equal(countPurchasesFor(dataIdAprovado), 1, "constraint unique(provider, provider_event_id) real garante isso");
  assert.equal(readHasPaidAccess(USER_ID), true);
});

// ---------- 5/6. eventos pendente e recusado (outros pagamentos) ----------

test("5. evento pendente (pagamento novo e distinto) -> status 'pending' real, has_paid_access permanece true", async () => {
  setSyntheticEnv();
  clearModuleCache();
  installRealAdminRpcFake();
  const dataIdPendente = `pay-pendente-${randomUUID()}`;

  const mercadopago = require("mercadopago");
  const originalGet = mercadopago.Payment.prototype.get;
  mercadopago.Payment.prototype.get = async function () {
    return { status: "pending", external_reference: USER_ID, transaction_amount: 50, date_created: "2026-11-01T13:00:00.000Z" };
  };
  const mod = requireCompiled(WEBHOOK_ENTRY);
  const res = await mod.POST(makeWebhookRequest({ dataId: dataIdPendente }));
  mercadopago.Payment.prototype.get = originalGet;

  assert.equal(res.status, 200);
  assert.equal(readPurchase(dataIdPendente).status, "pending");
  assert.equal(readHasPaidAccess(USER_ID), true, "a compra aprovada do passo 3 continua válida");
});

test("6. evento recusado (pagamento novo e distinto) -> status 'refused' real, has_paid_access permanece true", async () => {
  setSyntheticEnv();
  clearModuleCache();
  installRealAdminRpcFake();
  const dataIdRecusado = `pay-recusado-${randomUUID()}`;

  const mercadopago = require("mercadopago");
  const originalGet = mercadopago.Payment.prototype.get;
  mercadopago.Payment.prototype.get = async function () {
    return { status: "rejected", external_reference: USER_ID, transaction_amount: 147.9, date_created: "2026-11-01T14:00:00.000Z" };
  };
  const mod = requireCompiled(WEBHOOK_ENTRY);
  const res = await mod.POST(makeWebhookRequest({ dataId: dataIdRecusado }));
  mercadopago.Payment.prototype.get = originalGet;

  assert.equal(res.status, 200);
  assert.equal(readPurchase(dataIdRecusado).status, "refused");
  assert.equal(readHasPaidAccess(USER_ID), true);
});

// ---------- 7. reembolso do ÚNICO pagamento 'paid' -> revogação real ----------

test("7. reembolso do pagamento aprovado (único 'paid' do usuário) -> status 'refunded' real, has_paid_access REVOGADO de verdade", async () => {
  setSyntheticEnv();
  clearModuleCache();
  installRealAdminRpcFake();

  const mercadopago = require("mercadopago");
  const originalGet = mercadopago.Payment.prototype.get;
  mercadopago.Payment.prototype.get = async function () {
    return { status: "refunded", external_reference: USER_ID, transaction_amount: 147.9, date_last_updated: "2026-11-02T10:00:00.000Z" };
  };
  const mod = requireCompiled(WEBHOOK_ENTRY);
  const res = await mod.POST(makeWebhookRequest({ dataId: dataIdAprovado, requestId: "req-integration-refund" }));
  mercadopago.Payment.prototype.get = originalGet;

  assert.equal(res.status, 200);
  assert.equal(readPurchase(dataIdAprovado).status, "refunded");
  assert.equal(
    readHasPaidAccess(USER_ID),
    false,
    "nenhuma outra compra do usuário está 'paid' (as demais são pending/refused) -> acesso deve ser revogado de verdade",
  );
});

// ---------- 8. /conta (componente real) lido de forma independente, "novo login" ----------

test("8. ContaPage real, consultando o MESMO Postgres de forma independente, reflete o estado pós-reembolso (persistência/novo login)", async () => {
  clearModuleCache();
  injectFakeModule("lib/supabase/server", { async createClient() { return fakeSessionClientFor({ sub: USER_ID }); } });
  injectFakeModule("components/conta/ComprarAcessoButton", { ComprarAcessoButton: () => null });

  compile(["src/app/conta/page.tsx"]);
  const mod = requireCompiled("src/app/conta/page.tsx");
  const element = await mod.default();
  const texto = extractText(element);

  assert.match(texto, /Ainda não identificamos uma compra confirmada/, "após o reembolso, /conta não deve mais mostrar acesso liberado");
});

function extractText(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join(" ");
  if (typeof node === "object" && "props" in node) return extractText(node.props?.children);
  return "";
}

// ---------- 9. bloqueio sem compra válida (usuário que nunca comprou) ----------

test("9. usuário sem nenhuma compra -> has_paid_access real = false, download real nega acesso (403)", async () => {
  assert.equal(readHasPaidAccess(OUTRO_USER_SEM_COMPRA), false, "usuário novo, nunca comprou, nenhuma linha em purchases");

  clearModuleCache();
  injectFakeModule("lib/supabase/server", { async createClient() { return fakeSessionClientFor({ sub: OUTRO_USER_SEM_COMPRA }); } });
  injectFakeModule("lib/server/supabase-admin", { createAdminClient() { throw new Error("não deveria ser chamado sem has_paid_access"); } });
  injectFakeModule("lib/server/rate-limit", { checkRateLimit: () => ({ limited: false }) });

  const mod = requireCompiled(DOWNLOAD_ENTRY);
  const res = await mod.GET(
    new Request("http://localhost/api/templates/template01/download"),
    { params: Promise.resolve({ slug: "template01" }) },
  );
  const body = await res.json();
  assert.equal(res.status, 403);
  assert.equal(body.error, "access_denied");
});

// ---------- 10. entrega real para quem tinha acesso (antes do reembolso, com um usuário próprio) ----------

test("10. usuário com has_paid_access real = true recebe o conteúdo (Storage mockada, gate real) — 'entrega dos kits'", async () => {
  const compradorAtivo = randomUUID();
  insertProfile(compradorAtivo, "ativo@example.test");
  const ok = realApplyPurchaseEventRpc({
    p_user_id: compradorAtivo,
    p_provider: "mercadopago",
    p_provider_event_id: `pay-ativo-${randomUUID()}`,
    p_provider_event_at: "2026-11-01T15:00:00.000Z",
    p_status: "paid",
    p_amount_cents: 14790,
  });
  assert.equal(ok.data, true);
  assert.equal(readHasPaidAccess(compradorAtivo), true);

  clearModuleCache();
  injectFakeModule("lib/supabase/server", { async createClient() { return fakeSessionClientFor({ sub: compradorAtivo }); } });
  const storageFake = {
    from(bucket) {
      assert.equal(bucket, "template-assets");
      return {
        async list() {
          return { data: [{ name: "slide01.png" }], error: null };
        },
        async download() {
          return { data: new Blob([new Uint8Array([9, 9, 9])]), error: null };
        },
      };
    },
  };
  injectFakeModule("lib/server/supabase-admin", { createAdminClient: () => ({ storage: storageFake, from() { throw new Error("não deveria tocar tabela direto"); } }) });
  injectFakeModule("lib/server/rate-limit", { checkRateLimit: () => ({ limited: false }) });

  const mod = requireCompiled(DOWNLOAD_ENTRY);
  const res = await mod.GET(
    new Request("http://localhost/api/templates/template01/download"),
    { params: Promise.resolve({ slug: "template01" }) },
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "application/zip");
});
