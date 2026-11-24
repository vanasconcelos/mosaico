// Testes isolados de POST /api/checkout. Usa a lógica REAL de preço e
// de resolução de ambiente (@/lib/pricing, @/lib/server/mercadopago) —
// só a sessão (@/lib/supabase/server) e o método de rede do SDK
// (Preference.prototype.create) são substituídos. Nenhuma credencial
// real, nenhuma chamada de rede, nenhum valor do .env.local é lido ou
// usado — as variáveis de ambiente usadas aqui são sintéticas e
// existem só no processo deste teste.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  compile,
  injectFakeModule,
  clearModuleCache,
  requireCompiled,
} from "./helpers/compile.mjs";

const require = createRequire(import.meta.url);
const ROUTE_ENTRY = "src/app/api/checkout/route.ts";

// Variáveis sintéticas, só neste processo de teste — nunca gravadas em
// arquivo, nunca lidas de .env.local.
const ORIGINAL_ENV = { ...process.env };
function setSyntheticEnv() {
  process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-synthetic-unit-test-token";
  process.env.MERCADOPAGO_ENV = "test";
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  delete process.env.VERCEL_ENV;
  delete process.env.NODE_ENV;
}
function restoreEnv() {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
}

test.after(() => restoreEnv());

compile([ROUTE_ENTRY, "src/lib/server/mercadopago.ts", "src/lib/pricing.ts"]);

function loadRouteWith({ claims, createImpl }) {
  clearModuleCache();

  injectFakeModule("lib/supabase/server", {
    async createClient() {
      return {
        auth: {
          async getClaims() {
            if (!claims) return { data: null, error: { message: "no session" } };
            return { data: { claims }, error: null };
          },
        },
      };
    },
  });

  const mercadopago = require("mercadopago");
  const originalCreate = mercadopago.Preference.prototype.create;
  let capturedArgs = null;
  mercadopago.Preference.prototype.create = async function (args) {
    capturedArgs = args;
    if (createImpl) return createImpl(args);
    return { init_point: "https://example-test.invalid/checkout/synthetic" };
  };

  const mod = requireCompiled(ROUTE_ENTRY);
  return {
    mod,
    getCapturedArgs: () => capturedArgs,
    restoreSdk: () => {
      mercadopago.Preference.prototype.create = originalCreate;
    },
  };
}

async function callRoute(mod) {
  const res = await mod.POST();
  const body = await res.json();
  return { status: res.status, body };
}

test("sem variáveis do Mercado Pago configuradas -> 501, nunca finge sucesso", async () => {
  restoreEnv(); // garante que MERCADOPAGO_ACCESS_TOKEN etc. não estão setadas
  const { mod, restoreSdk } = loadRouteWith({ claims: { sub: "user-1" } });
  const { status, body } = await callRoute(mod);
  assert.equal(status, 501);
  assert.equal(body.error, "checkout_not_configured");
  restoreSdk();
});

test("sem sessão -> 401, mesmo com Mercado Pago configurado, e nunca chega a criar a Preference", async () => {
  setSyntheticEnv();
  const { mod, getCapturedArgs, restoreSdk } = loadRouteWith({ claims: null });
  const { status, body } = await callRoute(mod);
  assert.equal(status, 401);
  assert.equal(body.error, "unauthenticated");
  assert.equal(
    getCapturedArgs(),
    null,
    "sem sessão, a rota nunca deve chegar a chamar Preference.create (nenhuma Preference deve ser criada)",
  );
  restoreSdk();
});

test("preço enviado à Preference é sempre o valor canônico do servidor", async () => {
  setSyntheticEnv();
  const { formatMosaicoPrice } = requireCompiled("src/lib/pricing.ts");
  assert.equal(formatMosaicoPrice(), "R$ 147,90", "preço canônico esperado (147,90) não mudou");

  const { mod, getCapturedArgs, restoreSdk } = loadRouteWith({ claims: { sub: "user-42" } });
  const { status, body } = await callRoute(mod);
  assert.equal(status, 200);
  assert.equal(body.init_point, "https://example-test.invalid/checkout/synthetic");

  const args = getCapturedArgs();
  assert.equal(args.body.items.length, 1);
  assert.equal(args.body.items[0].unit_price, 147.9, "preço deve bater com MOSAICO_PRICE_CENTS/100, nunca um valor arbitrário");
  assert.equal(args.body.items[0].currency_id, "BRL");
  assert.equal(
    args.body.external_reference,
    "user-42",
    "external_reference deve ser o id da própria sessão, nunca algo vindo de fora",
  );
  assert.ok(args.body.back_urls.success.startsWith("http://localhost:3000"));
  restoreSdk();
});

test("falha da API do Mercado Pago -> 502, nunca 200 nem 500 genérico", async () => {
  setSyntheticEnv();
  const { MercadoPagoError } = require("mercadopago");
  const { mod, restoreSdk } = loadRouteWith({
    claims: { sub: "user-1" },
    createImpl: () => {
      throw new MercadoPagoError({ message: "falha sintética de teste", status: 400 });
    },
  });
  const { status, body } = await callRoute(mod);
  assert.equal(status, 502);
  assert.equal(body.error, "checkout_failed");
  restoreSdk();
});
