import type { Metadata } from "next";
import { RecuperarSenhaForm } from "./RecuperarSenhaForm";

/** Página de fluxo de autenticação — nunca indexável (ver nota em
 * src/app/robots.ts sobre por que isso não vira `disallow` lá).
 * `page.tsx` virou Server Component só pra poder exportar `metadata` —
 * todo o formulário (client, por causa de useActionState) segue intacto
 * em RecuperarSenhaForm.tsx, comportamento idêntico ao de antes. */
export const metadata: Metadata = {
  title: "Recuperar senha",
  robots: { index: false, follow: false },
};

export default function RecuperarSenhaPage() {
  return <RecuperarSenhaForm />;
}
