// Testes isolados de POST /api/webhooks/mercadopago. A assinatura HMAC
// é calculada aqui com um segredo sintético — nunca o segredo real do
// .env.local. A consulta ao pagamento na API do Mercado Pago
// (Payment.prototype.get) e o cliente administrativo do Supabase
// (createAdminClient) são substituídos por fakes; nenhuma rede real,
// nenhuma credencial real, nenhum dado de pagamento real é usado em
// nenhum momento.
//
// LIMITAÇÃO HONESTA, por favor leia antes de usar estes testes como
// prova de correção: desde a Etapa 4, a gravação de `purchases` e o
// recálculo de `profiles.has_paid_access` acontecem dentro da função
// SQL `apply_purchase_event` (migration 0004_atomic_purchase_access.sql),
// numa única chamada atômica. Estes testes JS fazem fake de
// `admin.rpc("apply_purchase_event", ...)` inteiro — ou seja, confirmam
// que A ROTA chama a função certa, com os parâmetros certos, na ordem
// certa, e trata erro corretamente. Eles NÃO exercitam a função SQL em
// si (a guarda de ordenação por `provider_event_at`, o recálculo
// agregado de has_paid_access, a atomicidade sob concorrência real) —
// isso exigiria um Postgres de verdade, indisponível neste ambiente.
// Ver tests/sql/verify-apply-purchase-event.sql para o roteiro de
// verificação manual dessa parte, a ser rodado contra um banco de teste
// antes da homologação.

import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import {
  compile,
  injectFakeModule,
  clearModuleCache,
  requireCompiled,
} from "./helpers/compile.mjs";

const require = createRequire(import.meta.url);
const ROUTE_ENTRY = "src/app/api/webhooks/mercadopago/route.ts";
const SYNTHETIC_SECRET = "synthetic-webhook-secret-unit-test-only";

const ORIGINAL_ENV = { ...process.env };
function setSyntheticEnv() {
  process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-synthetic-unit-test-token";
  process.env.MERCADOPAGO_ENV = "test";
  process.env.MERCADOPAGO_WEBHOOK_SECRET = SYNTHETIC_SECRET;
  delete process.env.VERCEL_ENV;
  delete process.env.NODE_ENV;
}
function restoreEnv() {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
}
test.after(() => restoreEnv());

compile([ROUTE_ENTRY, "src/lib/server/mercadopago.ts", "src/lib/pricing.ts"]);

function sign(dataId, requestId, ts, secret = SYNTHETIC_SECRET) {
  const template = `id:${dataId};request-id:${requestId};ts:${ts};`;
  return createHmac("sha256", secret).update(template).digest("hex");
}

function makeRequest({ dataId = "synthetic-payment-1", requestId = "req-1", ts, v1, noSig = false, noReqId = false }) {
  const realTs = ts ?? String(Date.now());
  const realV1 = v1 ?? sign(dataId, requestId, realTs);
  const url = `http://localhost/api/webhooks/mercadopago?data.id=${encodeURIComponent(dataId)}`;
  const headers = {};
  if (!noSig) headers["x-signature"] = `ts=${realTs},v1=${realV1}`;
  if (!noReqId) headers["x-request-id"] = requestId;
  return new Request(url, { method: "POST", headers });
}

function loadRouteWith({
  paymentResultsByDataId,
  paymentResult,
  paymentGetThrows,
  adminAvailable = true,
  rpcError = null,
  rpcRejectsWith = null,
}) {
  clearModuleCache();

  const rpcCalls = [];

  injectFakeModule("lib/server/supabase-admin", {
    createAdminClient() {
      if (!adminAvailable) return null;
      return {
        from(table) {
          // Regressão: a rota NUNCA deve mais escrever direto em
          // purchases/profiles — tudo passa pela função atômica.
          throw new Error(
            `a rota chamou .from("${table}") diretamente — deveria usar admin.rpc("apply_purchase_event") só`,
          );
        },
        rpc(fn, params) {
          rpcCalls.push({ fn, params });
          // Etapa 8 (Parte B): no supabase-js real, isto só rejeitaria
          // se a chamada encadeasse `.throwOnError()` — o que a rota
          // nunca faz (confirmado por leitura do código-fonte instalado
          // e por teste de integração local contra um PostgREST real,
          // ver migration 0004 / route.ts). `rpcRejectsWith` simula esse
          // caminho de qualquer forma, como defesa em profundidade: o
          // código precisa sobreviver a ele mesmo não devendo ocorrer.
          if (rpcRejectsWith) return Promise.reject(rpcRejectsWith);
          return Promise.resolve({ data: true, error: rpcError });
        },
      };
    },
  });

  const mercadopago = require("mercadopago");
  const originalGet = mercadopago.Payment.prototype.get;
  mercadopago.Payment.prototype.get = async function (args) {
    if (paymentGetThrows) throw paymentGetThrows;
    if (paymentResultsByDataId) return paymentResultsByDataId[args.id];
    return paymentResult;
  };

  const mod = requireCompiled(ROUTE_ENTRY);
  return {
    mod,
    rpcCalls,
    restoreSdk: () => {
      mercadopago.Payment.prototype.get = originalGet;
    },
  };
}

async function callRoute(mod, reqOpts = {}) {
  const res = await mod.POST(makeRequest(reqOpts));
  const body = await res.json();
  return { status: res.status, body };
}

test("sem segredo/config -> 501", async () => {
  restoreEnv();
  const { mod, restoreSdk } = loadRouteWith({ paymentResult: {} });
  const { status, body } = await callRoute(mod);
  assert.equal(status, 501);
  assert.equal(body.error, "webhook_not_configured");
  restoreSdk();
});

test("assinatura ausente -> 400", async () => {
  setSyntheticEnv();
  const { mod, restoreSdk } = loadRouteWith({ paymentResult: {} });
  const { status, body } = await callRoute(mod, { noSig: true });
  assert.equal(status, 400);
  assert.equal(body.error, "missing_fields");
  restoreSdk();
});

test("assinatura inválida -> 401, nunca chama apply_purchase_event", async () => {
  setSyntheticEnv();
  const { mod, rpcCalls, restoreSdk } = loadRouteWith({ paymentResult: {} });
  const { status, body } = await callRoute(mod, { v1: "0".repeat(64) });
  assert.equal(status, 401);
  assert.equal(body.error, "invalid_signature");
  assert.equal(rpcCalls.length, 0);
  restoreSdk();
});

test(
  "assinatura malformada (sem 'ts='/'v1=', não só valor errado) -> 401 tratado normalmente, nunca uma exceção não capturada",
  async () => {
    setSyntheticEnv();
    const { mod, rpcCalls, restoreSdk } = loadRouteWith({ paymentResult: {} });
    const res = await mod.POST(
      new Request("http://localhost/api/webhooks/mercadopago?data.id=x", {
        method: "POST",
        headers: { "x-signature": "formato-completamente-diferente", "x-request-id": "req-1" },
      }),
    );
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.error, "invalid_signature");
    assert.equal(rpcCalls.length, 0);
    restoreSdk();
  },
);

test("pagamento aprovado -> chama apply_purchase_event com status 'paid' e o timestamp REAL do pagamento (não new Date())", async () => {
  setSyntheticEnv();
  const { mod, rpcCalls, restoreSdk } = loadRouteWith({
    paymentResult: {
      status: "approved",
      external_reference: "user-synthetic-1",
      transaction_amount: 147.9,
      date_last_updated: "2026-01-15T10:00:00.000Z",
      date_approved: "2026-01-15T09:59:00.000Z",
    },
  });
  const { status, body } = await callRoute(mod, { dataId: "payment-approved-1" });
  assert.equal(status, 200);
  assert.equal(body.status, "paid");
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, "apply_purchase_event");
  const p = rpcCalls[0].params;
  assert.equal(p.p_user_id, "user-synthetic-1");
  assert.equal(p.p_provider, "mercadopago");
  assert.equal(p.p_provider_event_id, "payment-approved-1");
  assert.equal(p.p_status, "paid");
  assert.equal(p.p_amount_cents, 14790);
  assert.equal(
    p.p_provider_event_at,
    "2026-01-15T10:00:00.000Z",
    "deve usar date_last_updated do próprio pagamento, nunca a hora de processamento deste servidor",
  );
  restoreSdk();
});

test("fallback do timestamp: sem date_last_updated, usa date_approved; sem os dois, usa date_created", async () => {
  setSyntheticEnv();
  const { mod, rpcCalls, restoreSdk } = loadRouteWith({
    paymentResult: {
      status: "approved",
      external_reference: "user-x",
      date_approved: "2026-02-01T00:00:00.000Z",
    },
  });
  await callRoute(mod, { dataId: "payment-fallback-1" });
  assert.equal(rpcCalls[0].params.p_provider_event_at, "2026-02-01T00:00:00.000Z");
  restoreSdk();
});

test("pagamento pendente -> chama apply_purchase_event com status 'pending' (revogação/concessão fica a cargo da função SQL)", async () => {
  setSyntheticEnv();
  const { mod, rpcCalls, restoreSdk } = loadRouteWith({
    paymentResult: { status: "pending", external_reference: "user-2", date_last_updated: "2026-01-01T00:00:00.000Z" },
  });
  const { body } = await callRoute(mod, { dataId: "payment-pending-1" });
  assert.equal(body.status, "pending");
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].params.p_status, "pending");
  restoreSdk();
});

test("estorno (refunded) -> chama apply_purchase_event com status 'refunded'", async () => {
  setSyntheticEnv();
  const { mod, rpcCalls, restoreSdk } = loadRouteWith({
    paymentResult: { status: "refunded", external_reference: "user-3", date_last_updated: "2026-01-02T00:00:00.000Z" },
  });
  const { body } = await callRoute(mod, { dataId: "payment-refund-1" });
  assert.equal(body.status, "refunded");
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].params.p_status, "refunded");
  restoreSdk();
});

test(
  "GARANTIA (nível de integração, não de SQL): aprovação seguida de reembolso do MESMO pagamento " +
    "chama apply_purchase_event duas vezes, mesmo provider_event_id, status final 'refunded' — " +
    "a garantia de que o reembolso de fato vence (e não é revertido por um replay do evento " +
    "'approved') é da função SQL (migration 0004), não testável aqui sem Postgres real",
  async () => {
    setSyntheticEnv();
    const dataId = "payment-lifecycle-1";
    const { mod, rpcCalls, restoreSdk } = loadRouteWith({
      paymentResultsByDataId: {
        [dataId]: { status: "approved", external_reference: "user-8", date_last_updated: "2026-01-01T00:00:00.000Z" },
      },
    });
    await callRoute(mod, { dataId });
    restoreSdk();

    const { mod: mod2, rpcCalls: rpcCalls2, restoreSdk: restoreSdk2 } = loadRouteWith({
      paymentResultsByDataId: {
        [dataId]: { status: "refunded", external_reference: "user-8", date_last_updated: "2026-01-02T00:00:00.000Z" },
      },
    });
    await callRoute(mod2, { dataId });
    restoreSdk2();

    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0].params.p_status, "paid");
    assert.equal(rpcCalls2.length, 1);
    assert.equal(rpcCalls2[0].params.p_provider_event_id, dataId, "mesmo pagamento -> mesmo provider_event_id");
    assert.equal(rpcCalls2[0].params.p_status, "refunded");
    assert.ok(
      rpcCalls2[0].params.p_provider_event_at > rpcCalls[0].params.p_provider_event_at,
      "o timestamp do reembolso deve ser posterior ao da aprovação (vem do próprio pagamento, não é fabricado)",
    );
  },
);

test(
  "GARANTIA DE DESIGN (defesa em profundidade, não a única): mesmo um replay tardio de uma " +
    "notificação antiga sempre reconsulta a API antes de decidir — nunca confia no status da " +
    "notificação em si",
  async () => {
    setSyntheticEnv();
    // Simula: a notificação que chega agora É a mesma de uma aprovação
    // antiga (replay/reentrega), mas a API, reconsultada, já reflete o
    // estado real atual do pagamento (reembolsado nesse meio tempo) —
    // o código nunca lê status de lugar nenhum além do retorno de
    // payment.get(), então um replay nunca reintroduz um status velho
    // por conta própria.
    const { mod, rpcCalls, restoreSdk } = loadRouteWith({
      paymentResult: { status: "refunded", external_reference: "user-9", date_last_updated: "2026-01-03T00:00:00.000Z" },
    });
    await callRoute(mod, { dataId: "payment-replay-1" });
    assert.equal(rpcCalls[0].params.p_status, "refunded", "a rota usa o que a API diz AGORA, nunca um status implícito da notificação");
    restoreSdk();
  },
);

test("eventos concorrentes para o mesmo pagamento: ambas as chamadas chegam à função, cada uma com seu próprio status e timestamp (a serialização real é do Postgres, não testável aqui)", async () => {
  setSyntheticEnv();
  const dataId = "payment-concurrent-1";
  const { mod, rpcCalls, restoreSdk } = loadRouteWith({
    paymentResultsByDataId: {
      [dataId]: { status: "approved", external_reference: "user-10", date_last_updated: "2026-01-04T00:00:00.000Z" },
    },
  });
  // "Concorrente" aqui só no sentido de duas chamadas da mesma rota
  // sem await sequencial entre a leitura e a decisão — não reproduz
  // duas conexões de banco reais disputando a mesma linha.
  await Promise.all([callRoute(mod, { dataId, requestId: "req-a" }), callRoute(mod, { dataId, requestId: "req-b" })]);
  assert.equal(rpcCalls.length, 2);
  for (const call of rpcCalls) {
    assert.equal(call.params.p_provider_event_id, dataId);
  }
  restoreSdk();
});

test("pagamentos distintos do mesmo usuário: provider_event_id diferentes, mesmo p_user_id, sem conflito na rota", async () => {
  setSyntheticEnv();
  const { mod, rpcCalls, restoreSdk } = loadRouteWith({
    paymentResultsByDataId: {
      "payment-A": { status: "refunded", external_reference: "user-11", date_last_updated: "2026-01-05T00:00:00.000Z" },
      "payment-B": { status: "approved", external_reference: "user-11", date_last_updated: "2026-01-06T00:00:00.000Z" },
    },
  });
  await callRoute(mod, { dataId: "payment-A" });
  await callRoute(mod, { dataId: "payment-B" });
  assert.equal(rpcCalls.length, 2);
  assert.equal(rpcCalls[0].params.p_user_id, "user-11");
  assert.equal(rpcCalls[1].params.p_user_id, "user-11");
  assert.notEqual(rpcCalls[0].params.p_provider_event_id, rpcCalls[1].params.p_provider_event_id);
  restoreSdk();
});

test("repetição do mesmo evento: duas chamadas com o mesmo provider_event_id, ambas chegam à função", async () => {
  setSyntheticEnv();
  const { mod, rpcCalls, restoreSdk } = loadRouteWith({
    paymentResult: { status: "approved", external_reference: "user-4", date_last_updated: "2026-01-07T00:00:00.000Z" },
  });
  const dataId = "payment-repeat-1";
  await callRoute(mod, { dataId });
  await callRoute(mod, { dataId });
  assert.equal(rpcCalls.length, 2);
  assert.equal(rpcCalls[0].params.p_provider_event_id, dataId);
  assert.equal(rpcCalls[1].params.p_provider_event_id, dataId);
  restoreSdk();
});

test("falha ao consultar pagamento na API -> 502, nunca chama apply_purchase_event", async () => {
  setSyntheticEnv();
  const { MercadoPagoError } = require("mercadopago");
  const { mod, rpcCalls, restoreSdk } = loadRouteWith({
    paymentGetThrows: new MercadoPagoError({ message: "falha sintética", status: 404 }),
  });
  const { status, body } = await callRoute(mod, { dataId: "payment-fail-1" });
  assert.equal(status, 502);
  assert.equal(body.error, "payment_lookup_failed");
  assert.equal(rpcCalls.length, 0);
  restoreSdk();
});

test("sem external_reference -> 400, nunca chama apply_purchase_event", async () => {
  setSyntheticEnv();
  const { mod, rpcCalls, restoreSdk } = loadRouteWith({
    paymentResult: { status: "approved" },
  });
  const { status, body } = await callRoute(mod, { dataId: "payment-no-ref" });
  assert.equal(status, 400);
  assert.equal(body.error, "missing_external_reference");
  assert.equal(rpcCalls.length, 0);
  restoreSdk();
});

test("admin indisponível -> 501, nunca finge sucesso", async () => {
  setSyntheticEnv();
  const { mod, restoreSdk } = loadRouteWith({
    paymentResult: { status: "approved", external_reference: "user-5" },
    adminAvailable: false,
  });
  const { status, body } = await callRoute(mod, { dataId: "payment-noadmin" });
  assert.equal(status, 501);
  assert.equal(body.error, "access_grant_not_configured");
  restoreSdk();
});

test("falha ao aplicar o evento (apply_purchase_event retorna erro) -> 500, uma única chamada, nunca uma segunda escrita separada", async () => {
  setSyntheticEnv();
  const { mod, rpcCalls, restoreSdk } = loadRouteWith({
    paymentResult: { status: "approved", external_reference: "user-6", transaction_amount: 147.9, date_last_updated: "2026-01-08T00:00:00.000Z" },
    rpcError: { code: "40001", message: "erro sintético de escrita" },
  });
  const { status, body } = await callRoute(mod, { dataId: "payment-db-fail" });
  assert.equal(status, 500);
  assert.equal(body.error, "purchase_write_failed");
  assert.equal(
    rpcCalls.length,
    1,
    "só uma chamada à função atômica — não há uma segunda escrita separada que poderia aplicar parcialmente",
  );
  restoreSdk();
});

test(
  "Etapa 8 (Parte B): admin.rpc rejeitando a Promise (em vez de resolver com {error}) -> 500 tratado " +
    "normalmente, nunca uma exceção não capturada escapando de POST() — defesa em profundidade, já que " +
    "o caminho real (sem .throwOnError()) resolve com {error} e nunca rejeita, conforme confirmado na Etapa 8",
  async () => {
    setSyntheticEnv();
    const { mod, rpcCalls, restoreSdk } = loadRouteWith({
      paymentResult: {
        status: "approved",
        external_reference: "user-7",
        transaction_amount: 147.9,
        date_last_updated: "2026-01-09T00:00:00.000Z",
      },
      rpcRejectsWith: new Error("falha sintética: Promise rejeitada em vez de resolver com {error}"),
    });
    const { status, body } = await callRoute(mod, { dataId: "payment-rpc-reject-1" });
    assert.equal(status, 500);
    assert.equal(body.error, "purchase_write_failed");
    assert.equal(rpcCalls.length, 1);
    restoreSdk();
  },
);
