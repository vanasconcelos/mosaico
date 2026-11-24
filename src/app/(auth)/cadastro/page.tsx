import type { Metadata } from "next";
import { Suspense } from "react";
import { CadastroForm } from "./CadastroForm";

/** Página de fluxo de autenticação — nunca indexável (ver nota em
 * src/app/robots.ts sobre por que isso não vira `disallow` lá).
 * `page.tsx` virou Server Component só pra poder exportar `metadata` —
 * todo o formulário (client, por causa de useActionState/useSearchParams)
 * segue intacto em CadastroForm.tsx, comportamento idêntico ao de antes. */
export const metadata: Metadata = {
  title: "Criar conta",
  robots: { index: false, follow: false },
};

export default function CadastroPage() {
  // Mesmo motivo do /login: `useSearchParams` (dentro de CadastroForm)
  // exige um boundary de Suspense pra pré-renderização, mesmo sem nenhum
  // dado assíncrono real.
  return (
    <Suspense fallback={null}>
      <CadastroForm />
    </Suspense>
  );
}
