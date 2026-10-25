import { MercadoPagoConfig } from "mercadopago";

/**
 * Preço único do Mosaico, em centavos — a fonte canônica agora é
 * `src/lib/pricing.ts` (módulo sem dependência do SDK do Mercado Pago
 * nem de nada exclusivo do servidor, por isso seguro de importar em
 * componente de cliente, ex.: a FAQ). Reexportado aqui pra nenhuma rota
 * que já importava `MOSAICO_PRICE_CENTS` daqui precisar mudar o import
 * — nunca aceitar um valor vindo do navegador/checkout para esse campo.
 */
export { MOSAICO_PRICE_CENTS } from "@/lib/pricing";

/**
 * `null` enquanto as credenciais do Mercado Pago não existirem em
 * variável de ambiente do servidor — nunca lança nem inventa um valor.
 * Rotas que dependem disso devem checar `null` e responder de forma
 * honesta (ainda não configurado), nunca simular sucesso.
 */
export function getMercadoPagoConfig(): MercadoPagoConfig | null {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return null;
  }
  return new MercadoPagoConfig({ accessToken });
}

export type MercadoPagoEnvironment = "test" | "production";

/**
 * Qual valor de `MERCADOPAGO_ENV` é esperado, dado o ambiente real de
 * execução. Nunca usa só `NODE_ENV` pra isso: a própria Vercel define
 * `NODE_ENV=production` tanto em deployments de Preview quanto de
 * Production (comportamento documentado oficialmente da plataforma, não
 * do Next.js) — usar só `NODE_ENV` faria todo Preview exigir uma
 * credencial de produção, o oposto do desejado.
 *
 * `VERCEL_ENV` (`"production" | "preview" | "development"`, só existe
 * quando o processo roda de fato na Vercel) manda sempre que estiver
 * presente: só `"production"` exige `MERCADOPAGO_ENV=production`;
 * `"preview"` e `"development"` (e qualquer outro valor inesperado, por
 * segurança — nunca presumir produção) exigem `"test"`.
 *
 * Fora da Vercel (`VERCEL_ENV` ausente — ex.: `next dev`/`next start`
 * nesta máquina), mantém o sinal já usado antes desta correção
 * (`NODE_ENV`), sem alterar esse comportamento sem necessidade.
 */
function resolveExpectedMercadoPagoEnvironment(): MercadoPagoEnvironment {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv !== undefined) {
    return vercelEnv === "production" ? "production" : "test";
  }
  return process.env.NODE_ENV === "production" ? "production" : "test";
}

/**
 * Declaração EXPLÍCITA do ambiente do Mercado Pago, via `MERCADOPAGO_ENV`
 * — não é uma prova criptográfica nem uma identificação independente do
 * tipo de token. A documentação oficial confirma o prefixo `APP_USR` para
 * tokens de teste, mas não documenta um prefixo distinto para produção
 * (fonte: mercadopago.com.br/developers/en/docs/your-integrations/credentials;
 * ver também o levantamento da Fase 2A) — por isso esta função nunca
 * inspeciona o valor do token. Quem configura `.env.local`/o ambiente de
 * produção precisa declarar `MERCADOPAGO_ENV` corretamente; nada aqui
 * impede, por si só, alguém de colocar um token de produção com
 * `MERCADOPAGO_ENV=test` (ou vice-versa) — só impede que o valor
 * DECLARADO seja incompatível com o ambiente real de execução (Vercel
 * Production/Preview, ou local — ver `resolveExpectedMercadoPagoEnvironment`).
 *
 * Exige correspondência exata com o valor esperado. Ausente, inválido ou
 * cruzado -> null, e quem chama deve tratar isso como "ambiente não
 * configurado corretamente" e falhar explicitamente, nunca presumir um
 * valor.
 */
export function resolveMercadoPagoEnvironment(): MercadoPagoEnvironment | null {
  const raw = process.env.MERCADOPAGO_ENV;
  if (raw !== "test" && raw !== "production") {
    return null;
  }

  const expected = resolveExpectedMercadoPagoEnvironment();

  return raw === expected ? raw : null;
}

export type CheckoutBackUrls = {
  success: string;
  pending: string;
  failure: string;
};

/**
 * URLs de retorno do Checkout Pro, construídas só a partir de
 * `NEXT_PUBLIC_SITE_URL` — nunca de nada enviado pelo cliente (a rota
 * de checkout nem lê corpo de requisição). `null` se a variável estiver
 * ausente, malformada, ou não for HTTPS em produção — quem chama deve
 * tratar isso como "sem retorno seguro pra configurar agora" e falhar
 * explicitamente, nunca cair num fallback tipo `localhost` fora de
 * desenvolvimento nem inventar um domínio de produção.
 *
 * Reaproveita `/conta` como destino nos três estados (aprovado,
 * pendente, recusado) — é a única página que já existe hoje mostrando
 * status de acesso e o botão de comprar; esta fase não cria nenhuma
 * página nova de sucesso/erro. `/conta` ainda não diferencia "acabei de
 * pagar" de "já tinha acesso" na mensagem — lacuna de produto pra uma
 * etapa futura, não desta.
 *
 * O destino nunca concede acesso por si só: é só pra onde o navegador
 * do comprador volta depois do Checkout Pro — a liberação de
 * `has_paid_access` continua acontecendo exclusivamente no webhook,
 * depois de validar a notificação e reconsultar o pagamento na API.
 */
export function resolveCheckoutBackUrls(): CheckoutBackUrls | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) {
    return null;
  }

  let base: URL;
  try {
    base = new URL(raw);
  } catch {
    return null;
  }

  if (base.protocol !== "https:" && base.protocol !== "http:") {
    return null;
  }
  if (process.env.NODE_ENV === "production" && base.protocol !== "https:") {
    return null;
  }

  return {
    success: new URL("/conta", base).toString(),
    pending: new URL("/conta", base).toString(),
    failure: new URL("/conta", base).toString(),
  };
}
