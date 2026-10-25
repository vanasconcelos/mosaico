import { Container } from "@/components/ui/Container";
import { KitCatalogCard } from "@/components/kits/KitCatalogCard";
import { getAllKits } from "@/lib/kits";
import { getAllTemplates } from "@/lib/templates";

/**
 * Catálogo (`/kits`, novo em 2026-10-20) — antes não existia: a única
 * listagem de todos os kits era a antiga `KitsSection` na própria home.
 * Agora home e catálogo têm funções distintas: a home faz curadoria
 * (`FeaturedKitsSection`, 3 kits), o catálogo lista os `getAllKits()`
 * completos, carregados dinamicamente — nenhuma lista fixa paralela.
 *
 * Três lacunas do brief original, resolvidas explicitamente em vez de
 * deixadas em aberto:
 * - Preço/informação comercial: não existe campo no tipo `Kit` — não
 *   renderiza nada (nem um "N/A" visível).
 * - Filtro por categoria/profissão: não implementado nesta rodada — o
 *   único sinal real filtrável hoje ("tem conteúdo vs. vazio") pareceria
 *   painel de admin, não uma categoria que um comprador reconheceria.
 * - Loading/vazio/erro: não aplicável — `getAllKits()` é síncrono, sem
 *   I/O, nunca vazio; fingir esses estados simularia uma infraestrutura
 *   assíncrona que não existe no projeto.
 */
export default function KitsCatalogPage() {
  const kits = getAllKits();
  const totalTemplates = getAllTemplates().length;

  return (
    <section className="bg-grid-paper bg-mosaico-bg py-20 lg:py-28">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-sans text-xs font-semibold tracking-[0.2em] text-mosaico-accent-deep uppercase">
            Catálogo
          </p>
          <h1 className="mt-3 font-serif text-4xl text-mosaico-ink sm:text-5xl">
            Todos os kits do Mosaico
          </h1>
          <p className="mt-4 font-sans text-base text-mosaico-ink-soft">
            {kits.length} coleções organizadas por profissão, somando{" "}
            {totalTemplates} templates já cadastrados. Cada uma reúne o que
            faz sentido pra quem trabalha naquela área — do post de feed ao
            material pra apresentar pro cliente.
          </p>
        </div>

        <div className="mt-20 grid grid-cols-1 gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
          {kits.map((kit, i) => (
            <KitCatalogCard key={kit.id} kit={kit} tilt={i % 2 === 0 ? -1 : 1} />
          ))}
        </div>
      </Container>
    </section>
  );
}
