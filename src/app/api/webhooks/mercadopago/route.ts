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

  // Timestamp do PRÓPRIO pagamento, nunca da hora de processamento deste
  // servidor — é o que a coluna já documentava desde a migration 0001
  // ("timestamp do PROVEDOR, nunca do recebimento"), mas o código nunca
  // tinha honrado isso. `date_last_updated` é o campo que o tipo da SDK
  // documenta como "Last modification timestamp" — usado como guarda de
  // ordenação pela função abaixo. NÃO HÁ confirmação na documentação
  // oficial de que esse campo se atualiza em TODA transição de status
  // (reembolso, disputa) — a mesma incerteza já registrada na migration
  // 0004 (seção "PENDENTE DE CONFIRMAÇÃO EXTERNA"), não resolvida nesta
  // etapa. Por isso a função SQL nunca trata um timestamp empatado como
  // prova de ordem real dos eventos — resolve empate por precedência de
  // status (Etapa 6 da migration 0004), não por este campo. `new Date()`
  // só como último recurso, se o pagamento não trouxer nenhum dos três
  // campos (degrada pro comportamento antigo apenas nesse caso raro,
  // nunca silenciosamente no caminho comum).
  const providerEventAt =
    result.date_last_updated ?? result.date_approved ?? result.date_created ?? new Date().toISOString();

  // Grava o evento E recalcula has_paid_access numa única chamada
  // atômica (função apply_purchase_event, migration 0004) — nunca duas
  // escritas sequenciais independentes. A função:
  //   - só aplica a atualização se este evento for igual ou mais recente
  //     que o já gravado para o mesmo (provider, provider_event_id),
  //     nunca deixando um evento atrasado reverter um estado mais novo;
  //   - recalcula has_paid_access como EXISTS de qualquer compra 'paid'
  //     do usuário, nunca um valor imperativo fixado só pelo status
  //     desta chamada — consistente mesmo se o usuário tiver mais de uma
  //     compra;
  //   - levanta exceção (nunca aplica silenciosamente) se a compra já
  //     registrada para este provider_event_id pertencer a outro
  //     usuário (guarda de titularidade, Etapa 8).
  //
  // Etapa 8 (Parte B): o comportamento PADRÃO do @supabase/supabase-js
  // (confirmado via leitura do código-fonte instalado,
  // node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts, e via
  // teste de integração local contra um PostgREST real) é resolver com
  // `{ data, error }` mesmo quando a função Postgres levanta exceção —
  // nunca rejeitar a Promise — enquanto `.rpc()` não encadear
  // `.throwOnError()`, o que este código nunca faz. O try/catch abaixo
  // não deveria disparar no caminho atual; existe como defesa em
  // profundidade contra uma mudança futura (ex.: alguém encadear
  // `.throwOnError()`) virar uma exceção não tratada aqui, deixando de
  // responder ao Mercado Pago (que reinterpretaria como falha de
  // entrega e tentaria de novo — comportamento aceitável, mas pior que
  // um 500 explícito e silencioso quanto a detalhes do erro).
  let applyError: { code?: string } | null;
  try {
    const rpcResult = await admin.rpc("apply_purchase_event", {
      p_user_id: userId,
      p_provider: "mercadopago",
      p_provider_event_id: dataId,
      p_provider_event_at: providerEventAt,
      p_status: status,
      p_amount_cents: result.transaction_amount ? Math.round(result.transaction_amount * 100) : null,
    });
    applyError = rpcResult.error;
  } catch (err) {
    // Nunca logar o erro inteiro (pode conter dado do pagamento) — só a
    // classe do erro. 500 (não um 2xx) para preservar o retry do
    // Mercado Pago, igual ao caminho de `applyError` abaixo.
    console.error("webhook mercadopago: admin.rpc rejeitou inesperadamente", {
      errorClass: err instanceof Error ? err.constructor.name : typeof err,
    });
    return NextResponse.json({ error: "purchase_write_failed" }, { status: 500 });
  }

  if (applyError) {
    // Nunca logar o corpo da notificação nem dados do pagamento — só o
    // código do erro, pra diagnosticar sem expor nada sensível.
    console.error("webhook mercadopago: falha ao aplicar evento de compra", applyError.code);
    return NextResponse.json({ error: "purchase_write_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true, status });
}
