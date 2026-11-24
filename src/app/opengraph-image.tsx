import { ImageResponse } from "next/og";

/**
 * Imagem de Open Graph institucional — fallback para qualquer página que
 * não defina a sua própria (Fase 4.3, item 2). Gerada por código a partir
 * da própria paleta de marca (hex copiados de src/app/globals.css, nunca
 * inventados) e do título/subtítulo já usados em src/app/layout.tsx —
 * nenhum design novo, nenhuma arte do Canva, nenhum arquivo do Storage
 * envolvido. Herdada automaticamente por toda rota que não sobrescrever
 * `openGraph.images` (kits e templates com capa real sobrescrevem; as
 * demais — home, catálogo, páginas de conta/autenticação — usam esta).
 */
export const alt = "Mosaico — Templates editáveis no Canva por nicho profissional";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          backgroundColor: "#f7f0e8",
          padding: "90px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#b58b5d",
          }}
        >
          Templates editáveis no Canva
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 128,
            fontWeight: 600,
            color: "#17130f",
          }}
        >
          Mosaico
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 34,
            maxWidth: 880,
            color: "#541126",
          }}
        >
          Kits de templates organizados por nicho profissional
        </div>
      </div>
    ),
    { ...size },
  );
}
