import { NextResponse } from "next/server";
import { MercadoPagoError, Preference } from "mercadopago";
import { createClient } from "@/lib/supabase/server";
import {
  getMercadoPagoConfig,
  MOSAICO_PRICE_CENTS,
  resolveCheckoutBackUrls,
  resolveMercadoPagoEnvironment,
} from "@/lib/server/mercadopago";

/**
 * Cria uma Preference do Checkout Pro para o acesso único ao Mosaico.
 *
 * Preço e descrição vêm só do servidor (MOSAICO_PRICE_CENTS) — nunca de
 * nada enviado pelo navegador. O comprador é identificado pela sessão
 * já autenticada (`external_reference` = id do usuário), nunca por um
 * e-mail ou id que o cliente possa informar na requisição.
 *
 * Ainda não grava nada em `purchases` aqui — isso só acontece depois
 * que o webhook confirmar o pagamento junto ao Mercado Pago (ver
 * src/app/api/webhooks/mercadopago/route.ts). Esta rota só inicia o
 * checkout. As URLs de retorno (`back_urls`) só decidem pra onde o
 * navegador volta depois de pagar — nunca concedem acesso por si só.
 */
export async function POST() {
  const config = getMercadoPagoConfig();
  if (!config) {
    return NextResponse.json(
      { error: "checkout_not_configured" },
      { status: 501 },
    );
  }

  // `MERCADOPAGO_ENV` ausente, inválida ou incompatível com `NODE_ENV`
  // (ver `resolveMercadoPagoEnvironment`, src/lib/server/mercadopago.ts):
  // falha aqui, antes de qualquer chamada à API do Mercado Pago. Nunca
  // tenta inferir o ambiente pelo formato do token.
  if (!resolveMercadoPagoEnvironment()) {
    return NextResponse.json(
      { error: "mercadopago_environment_not_configured" },
      { status: 501 },
    );
  }

  // `NEXT_PUBLIC_SITE_URL` ausente/inválida/HTTP-em-produção: falha
  // explícita aqui, nunca cai num fallback tipo `localhost` fora de
  // desenvolvimento nem inventa um domínio de produção (ver
  // `resolveCheckoutBackUrls`, src/lib/server/mercadopago.ts).
  const backUrls = resolveCheckoutBackUrls();
  if (!backUrls) {
    return NextResponse.json(
      { error: "checkout_return_url_not_configured" },
      { status: 501 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const userId = data.claims.sub;

  const preference = new Preference(config);
  let result;
  try {
    result = await preference.create({
      body: {
        items: [
          {
            id: "mosaico-acesso-global",
            title: "Mosaico — acesso completo aos kits",
            quantity: 1,
            unit_price: MOSAICO_PRICE_CENTS / 100,
            currency_id: "BRL",
          },
        ],
        external_reference: userId,
        back_urls: backUrls,
        // `auto_return` exige `back_urls.success` preenchida (a API do
        // Mercado Pago rejeita a Preference sem isso) — `backUrls` só
        // chega aqui já com os três destinos resolvidos, nunca parcial.
        auto_return: "approved",
        payment_methods: {
          excluded_payment_types: [],
        },
      },
    });
  } catch (err) {
    // Nunca loga corpo, causas ou o objeto de erro inteiro (podem trazer
    // detalhe interno da API) — só a classe do erro e o status HTTP,
    // quando o SDK fornece (erros do tipo MercadoPagoError sempre têm;
    // falha de rede/timeout não tem `status` numérico).
    console.error("checkout: falha ao criar preference na API do Mercado Pago", {
      errorClass: err instanceof Error ? err.constructor.name : typeof err,
      status: err instanceof MercadoPagoError ? err.status : undefined,
    });
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }

  return NextResponse.json({ init_point: result.init_point });
}
