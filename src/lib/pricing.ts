/**
 * Preço único do Mosaico — fonte canônica única, em centavos. Valor
 * puro, sem nenhuma dependência (nem do SDK do Mercado Pago, nem de
 * variável de ambiente, nem de nada exclusivo do servidor) — por isso
 * este módulo pode ser importado tanto por componentes de servidor
 * quanto por componentes `"use client"` sem risco de arrastar nada
 * sensível pro bundle do navegador. `src/lib/server/mercadopago.ts`
 * reexporta este valor pro checkout continuar importando de onde já
 * importava, sem precisar mudar nada lá.
 */
export const MOSAICO_PRICE_CENTS = 14790;

/**
 * Formata o preço no padrão brasileiro (ex.: "R$ 147,90") — única
 * função que sabe formatar esse valor; nenhum componente deve montar a
 * string na mão. Usa `Intl` (correto pra qualquer valor futuro,
 * inclusive milhares), só normalizando o espaço que o `Intl` insere
 * entre "R$" e o número (NBSP, U+00A0) pro espaço comum — o mesmo
 * caractere que já existia no texto fixo da FAQ antes desta mudança,
 * pra não alterar a renderização.
 */
export function formatMosaicoPrice(): string {
  return (MOSAICO_PRICE_CENTS / 100)
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    .replace(/ /g, " ");
}
