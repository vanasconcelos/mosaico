import type { NextConfig } from "next";

/**
 * Cabeçalhos de segurança HTTP (auditoria de prontidão para publicação,
 * item 7 — "faltam cabeçalhos de segurança").
 *
 * Levantamento real do que a aplicação efetivamente usa, antes de
 * escrever qualquer regra (nunca uma CSP genérica copiada de outro
 * projeto):
 *   - Nenhum script de terceiro, nenhum <script> inline próprio, nenhum
 *     next/script em todo o `src/` (confirmado por busca).
 *   - Fontes (Fraunces, Karla) vêm de `next/font/google`, que AUTO-HOSPEDA
 *     os arquivos no próprio domínio em build time — nunca uma requisição
 *     de runtime a fonts.googleapis.com/fonts.gstatic.com (confirmado:
 *     nenhum <link> para esses domínios em nenhuma página).
 *   - Nenhum <iframe> em nenhum componente.
 *   - `src/lib/supabase/client.ts` (client de browser) existe mas NUNCA é
 *     importado em lugar nenhum (confirmado por busca) — toda chamada de
 *     autenticação roda em Server Actions/Route Handlers, servidor-a-
 *     servidor. O browser nunca fala direto com a API do Supabase.
 *   - A única requisição de browser para um domínio externo é a tag
 *     <img> de `SignedImage.tsx`, que recebe URLs assinadas do bucket
 *     PRIVADO do Supabase Storage (`template-assets`) — por isso o host
 *     do Supabase entra em `img-src`, nunca em `connect-src`.
 *   - O botão "Comprar acesso" (`ComprarAcessoButton.tsx`) faz
 *     `fetch("/api/checkout")` (mesma origem) e depois uma NAVEGAÇÃO de
 *     página inteira (`window.location.href = ...`) para o Checkout Pro
 *     do Mercado Pago — CSP não governa navegação de página inteira (só
 *     fetch/XHR/WebSocket), então isso não exige nenhuma entrada em
 *     `connect-src` nem em `frame-src`.
 *
 * Exceção necessária e justificada: `script-src 'self' 'unsafe-inline'`.
 * O App Router do Next.js injeta, ele mesmo, pequenos <script> inline
 * (`self.__next_f.push(...)`) para transmitir o payload de Server
 * Components durante o streaming — isso é interno ao framework, não
 * nosso código, e acontece em toda página. Confirmado nesta auditoria
 * (ver relatório): com `script-src 'self'` sem exceção, a build de
 * produção carrega mas o streaming de RSC é bloqueado pela CSP
 * (violação real observada no console, não suposição). A alternativa
 * correta sem `unsafe-inline` é um nonce por requisição gerado no
 * `proxy.ts` — fora do escopo autorizado desta correção, que restringe
 * mudanças em `proxy.ts` só ao comentário obsoleto (ver Correção 3).
 * Registrado como pendência técnica para uma fase futura.
 *
 * `style-src 'self' 'unsafe-inline'`: duas causas reais, não só o
 * framework. (1) O próprio código do Mosaico usa `style={{ aspectRatio }}`
 * (valor dinâmico por template, não expressável como classe Tailwind
 * estática) em `TemplateGallery.tsx`, `TemplatePreview.tsx`,
 * `TemplateDetail.tsx`, `TemplateDetailSkeleton.tsx` e
 * `PresentationFolderCard.tsx` (`zIndex` dinâmico) — o React renderiza
 * isso como atributo `style` inline de verdade no HTML, e CSP governa
 * esse atributo. (2) O próprio Next.js também injeta `<style>`/atributos
 * inline seus. Confirmado por violação real no console ao testar sem a
 * exceção (build de produção real, não suposição) — o Tailwind em si
 * compila para um arquivo CSS estático (`'self'`), não é a causa.
 */
const SUPABASE_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

function buildCsp(): string {
  const imgSrc = ["'self'", "data:", SUPABASE_ORIGIN].filter(Boolean).join(" ");

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSrc}`,
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

const nextConfig: NextConfig = {
  async headers() {
    const securityHeaders = [
      { key: "Content-Security-Policy", value: buildCsp() },
      // Redundante com `frame-ancestors` para navegadores antigos que
      // não suportam essa diretiva de CSP.
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      },
    ];

    // HSTS só faz sentido anunciado sobre HTTPS real — em `next dev`/
    // `next start` local (HTTP) o cabeçalho seria ignorado pelo navegador
    // de qualquer forma, mas não o incluímos fora de produção para nunca
    // sugerir uma garantia que o ambiente atual não tem.
    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
