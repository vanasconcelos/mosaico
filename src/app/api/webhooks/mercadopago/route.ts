import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { MercadoPagoError, Payment } from "mercadopago";
import {
  getMercadoPagoConfig,
  resolveMercadoPagoEnvironment,
} from "@/lib/server/mercadopago";
import { createAdminClient } from "@/lib/server/supabase-admin";

/**
 * Status do Mercado Pago -> status aceito pela coluna `purchases.status`
 * (`check (status in ('pending','paid','refused','refunded','disputed'))`,
 * migration 0001). Nunca grava um valor fora dessa lista.
 */
function mapStatus(mpStatus: string | undefined): string {
  switch (mpStatus) {
    case "approved":
      return "paid";
    case "pending":
    case "in_process":
      return "pending";
    case "rejected":
    case "cancelled":
      return "refused";
    case "refunded":
      return "refunded";
    case "charged_back":
      return "disputed";
    default:
      return "pending";
  }
}

/**
 * Valida a assinatura `x-signature` (formato `ts=...,v1=...`) contra o
 * template documentado pelo Mercado Pago:
 * `id:{data.id};request-id:{x-request-id};ts:{ts};`, HMAC-SHA256 com o
 * segredo da integração. Nunca processa a notificação sem isso passar.
 */
function isSignatureValid(
  signatureHeader: string,
  requestId: string,
  dataId: string,
  secret: string,
): boolean {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.trim().split("=") as [string, string]),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const template = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(template).digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  const config = getMercadoPagoConfig();
  if (!secret || !config) {
    return NextResponse.json(
      { error: "webhook_not_configured" },
      { status: 501 },
    );
  }

  // `MERCADOPAGO_ENV` ausente, inválida ou incompatível com `NODE_ENV`
  // (ver `resolveMercadoPagoEnvironment`, src/lib/server/mercadopago.ts):
  // falha aqui, antes de consultar a API do Mercado Pago. Nunca tenta
  // inferir o ambiente pelo formato do token.
  if (!resolveMercadoPagoEnvironment()) {
    return NextResponse.json(
      { error: "mercadopago_environment_not_configured" },
      { status: 501 },
    );
  }

  const url = new URL(request.url);
  const dataId = url.searchParams.get("data.id");
  const signatureHeader = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");

  if (!dataId || !signatureHeader || !requestId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  if (!isSignatureValid(signatureHeader, requestId, dataId, secret)) {
    // Nunca registrar o cabeçalho de assinatura nem o corpo em log —
    // só o resultado da validação.
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // Nunca confiar só na notificação: consultar o pagamento de verdade
  // na API do Mercado Pago antes de qualquer decisão de acesso.
  const payment = new Payment(config);
  let result;
  try {
    result = await payment.get({ id: dataId });
  } catch (err) {
    // Captura só esta chamada externa (nunca o handler inteiro) — uma
    // falha de validação ou de gravação no Supabase mais abaixo continua
    // com o próprio tratamento, sem passar por aqui. Nunca loga corpo,
    // causas ou o erro inteiro (podem trazer dado do pagamento) — só a
    // classe do erro e o status HTTP, quando o SDK fornece. 502 (não
    // 500) de propósito: sinaliza falha externa, nunca concede acesso
    // nem responde como processado, e convida o Mercado Pago a tentar
    // entregar a notificação de novo mais tarde — o próprio mecanismo
    // de retry de webhook dele, não algo que este código precisa
    // reimplementar.
    console.error("webhook mercadopago: falha ao consultar pagamento na API", {
      errorClass: err instanceof Error ? err.constructor.name : typeof err,
      status: err instanceof MercadoPagoError ? err.status : undefined,
    });
    return NextResponse.json({ error: "payment_lookup_failed" }, { status: 502 });
  }

  const admin = createAdminClient();
  if (!admin) {
    // Sem service_role configurada, não há como gravar `purchases` nem
    // liberar acesso (RLS bloqueia isso pra qualquer outro papel, de
    // propósito). Responder 501 em vez de fingir que processou.
    return NextResponse.json(
      { error: "access_grant_not_configured" },
      { status: 501 },
    );
  }

  const userId = result.external_reference;
  if (!userId) {
    return NextResponse.json({ error: "missing_external_reference" }, { status: 400 });
  }

  const status = mapStatus(result.status);

  // Idempotência real, não só de aplicação: `upsert` com o par
  // (provider, provider_event_id) que a migration 0001 já define como
  // `unique` — reprocessar a mesma notificação várias vezes sempre
  // atualiza a MESMA linha, nunca cria uma duplicata, mesmo sob
  // concorrência (a garantia vem do banco, não só deste código).
  const { error: purchaseError } = await admin.from("purchases").upsert(
    {
      user_id: userId,
      provider: "mercadopago",
      provider_event_id: dataId,
      provider_event_at: new Date().toISOString(),
      status,
      amount_cents: result.transaction_amount
        ? Math.round(result.transaction_amount * 100)
        : null,
    },
    { onConflict: "provider,provider_event_id" },
  );

  if (purchaseError) {
    // Nunca logar o corpo da notificação nem dados do pagamento — só o
    // código do erro, pra diagnosticar sem expor nada sensível.
    console.error("webhook mercadopago: falha ao gravar purchases", purchaseError.code);
    return NextResponse.json({ error: "purchase_write_failed" }, { status: 500 });
  }

  // Acesso global: `paid` libera; `refunded`/`disputed` revoga. Nenhum
  // outro status altera `has_paid_access` — `pending`/`refused` nunca
  // chegaram a liberar, então não há nada a revogar nesses casos.
  if (status === "paid") {
    await admin.from("profiles").update({ has_paid_access: true }).eq("id", userId);
  } else if (status === "refunded" || status === "disputed") {
    await admin.from("profiles").update({ has_paid_access: false }).eq("id", userId);
  }

  return NextResponse.json({ received: true, status });
}
