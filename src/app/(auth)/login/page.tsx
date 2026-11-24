import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

/** Página de fluxo de autenticação — nunca indexável (ver nota em
 * src/app/robots.ts sobre por que isso não vira `disallow` lá).
 * `page.tsx` virou Server Component só pra poder exportar `metadata` —
 * todo o formulário (client, por causa de useActionState/useSearchParams)
 * segue intacto em LoginForm.tsx, comportamento idêntico ao de antes. */
export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  // `useSearchParams` (dentro de LoginForm) precisa de um boundary de
  // Suspense pro build conseguir pré-renderizar a casca da página
  // (exigência do Next.js, não opcional) — o formulário em si não
  // precisa de nenhum dado assíncrono, então o fallback nunca chega a
  // aparecer de verdade.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
