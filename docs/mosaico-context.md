# Mosaico — Contexto Consolidado para Implementação

> Documento de referência recebido no início do projeto (2026-09-14), reunindo
> decisões de conversas anteriores. Tratar como ponto de partida, não como
> verdade absoluta — validar sempre contra o estado real do repositório antes
> de agir.

## 1. O que é o Mosaico

- Plataforma digital para venda e distribuição de templates de social media
  feitos no Canva.
- Templates organizados por **nicho profissional** ("kits"), não por estilo
  visual.
- Nichos confirmados: Social Media (geral), Advogados (renomeado depois
  para "Institucional Advocacia", ver seção 3), Personal Trainer,
  Consultoria Empresarial, Contabilidade, Nutrição Esportiva, HOF,
  Biomedicina Estética, Maquiadoras, Aesthetic (influencers — não
  confundir com Biomedicina Estética) — outros a definir pós-lançamento.
  Havia também um kit "Estética" (`slug: "estetica"`, distinto de
  Biomedicina Estética), removido a pedido da Ana em 2026-09-21
  (`src/lib/kits.ts`) — nunca teve templates reais cadastrados.
- Critério de sucesso: um admin consegue cadastrar templates (nome, imagem,
  link Canva, categoria, pack, tags, publicar) **sem tocar em código**.
- Arquitetura precisa suportar crescimento de dezenas para milhares de
  templates sem mudança estrutural.

**Stack aprovada:** Next.js, TypeScript, Tailwind CSS, Supabase (Auth,
Storage, PostgreSQL), Vercel.

## 2. Identidade visual

### Plataforma Mosaico (institucional)

- Paleta: fundo `#FAF5EF`, texto primário `#2E1910`, texto secundário
  `#927968`, bordas `#705D4F`, destaque primário `#CD7B52`, destaque
  secundário `#744125`.
- Fontes: Fraunces (serif) para headlines de landing/marca; Inter (sans) para
  toda UI de produto.
- Estética editorial-neutra na landing; comportamento de dashboard/admin
  estilo SaaS.

### Sub-marca "Índice" (Kit Social Media)

- Paleta aprovada: cream `#F1E9DD`, ink `#1C1712`, café `#4A2F22`, terracota
  `#B5562E`, wine `#5A1F27`.
- Tipografia: Playfair Display, bold e italic.
- Tratamento de foto: duotone café→terracota.
- Grid assimétrico, layouts guiados por fotografia, elementos sangrando a
  margem. Composição fotográfica real — não puramente tipográfica.

### Sistema de composição (5 padrões do kit)

Três camadas em toda peça: (1) fundo — tipografia gigante (ghost type) ou
espaço vazio; (2) meio — fotografia; (3) frente — informação funcional,
pequena, mesmo tratamento tipográfico em toda a coleção.

1. Ghost Type + Foto Sobreposta
2. Foto Dominante + Palavra Cortada
3. Vazio + Tipografia + Detalhe
4. Sobreposição com Sangria
5. Tipográfico Editorial

Capa aplica o Padrão 1 de forma radical. Fixo na coleção: tratamento de foto,
tipografia de destaque (Playfair Display), paleta, grid de margens, espaço
negativo como composição. Variável: enquadramento, posição, escala,
quantidade de informação, alinhamento.

## 3. Regra de negócio central — Master vs Link do Modelo

Cada template tem **dois recursos do Canva que nunca podem ser confundidos**:

### Master (original)

- Criação original de Ana, intocável. Nunca reconstruído, modificado ou usado
  para gerar nova versão. 100% privado — nunca link de edição, nenhum
  comprador pode alterá-lo.
- Serve só para exportar o preview (PNG) e como fonte de rastreabilidade
  interna.

### Link do Modelo do Canva ("Template Link")

- Recurso específico do Canva **Template Link** (Compartilhar → Ver mais
  opções → Link de modelo) — não link de visualização pública, não "pode
  editar" colaborativo.
- Ao clicar, o Canva cria automaticamente uma **cópia independente** na conta
  do comprador — não afeta o master nem cópias de outros compradores.
- Disponível em contas Canva Pro/Teams/Enterprise/Educação/Sem Fins
  Lucrativos.

## 3.1. Regra central de acesso (correção — 2026-09-14)

> Substitui qualquer menção anterior a compra por kit/pack/template
> individual neste documento. Vale para **todas as próximas
> implementações**.

O Mosaico **não tem acesso individual por Kit**. O modelo é pagamento único
= acesso total:

```
USER
 └─ PAYMENT STATUS (hasPaidAccess: boolean, global — não por kit/template)
     ├─ false → só landing pública: conhece o Mosaico, vê previews/amostras
     │          dos Kits e Templates. Sem acesso a Kit completo, Template
     │          completo ou canva_editable_url.
     └─ true  → TODOS os Kits, TODOS os Packs, TODOS os Templates
                desbloqueados. canva_editable_url liberado em qualquer um.
```

- **Não existe** "comprou o Kit A, só acessa o Kit A" — isso não faz parte
  do modelo.
- Antes do pagamento, os Kits aparecem na landing como vitrine/preview (é
  para isso que servem ali) — nunca como unidade de compra separada.
- Depois do pagamento confirmado, o acesso é igual e completo para
  qualquer usuário pagante.
- A arquitetura continua preparada para autenticação e pagamento, mas o
  controle de acesso é **global por usuário**, nunca por
  kit/pack/template.

## 3.2. Kit Social Media — posicionamento exclusivo (2026-09-15)

> Regra específica **só** do Kit Social Media — **não** aplicar
> automaticamente aos outros kits. Cada um dos outros pode ter sua própria
> proposta e tipos de material, de acordo com o público dele.

Diferente dos demais kits (focados na comunicação do **negócio/marca do
cliente final**), o Kit Social Media atende quem **trabalha** com social
media — o profissional, não o negócio dele. Conceito:

> "Tudo o que o social media precisa para criar, organizar e apresentar
> seu trabalho."

Não é só uma coleção de templates pra postar — é uma biblioteca de
ferramentas visuais pro dia a dia. Resolve dois lados da rotina:

1. **CRIAR** — templates de Feed, Story, Carrossel: o conteúdo que vai pro
   ar.
2. **TRABALHAR** — ferramentas visuais para planejar, apresentar,
   organizar e entregar o trabalho ao cliente: apresentações de
   estratégia, de planejamento, de propostas/conceitos, materiais de
   ideias e referências, templates para reuniões com cliente, apoio pra
   organização da rotina, e qualquer peça que facilite a comunicação
   profissional entre social media e cliente.

A categoria **"Apresentação"** (já existe no schema, seção 4) ganha peso
especial aqui — dentro deste kit ela **não** é "mais um formato de post":
é o material que o social media usa pra apresentar/defender o próprio
trabalho, estratégia, planejamento, ideias, resultados ou proposta perante
o cliente.

Isso deve orientar a curadoria de templates futuros deste kit
especificamente — nenhum template novo foi cadastrado ainda, esta seção é
só a especificação/fonte de verdade pra quando isso acontecer.

## 3.3. Correção definitiva — `canvaUrl` sempre Template Link, nunca `/edit` (2026-09-22)

> Regra absoluta, vale para **todo template já cadastrado e todo template
> futuro**. Referenciada em `src/lib/templates.ts`, `src/types/template.ts`
> e `EditInCanvaButton.tsx`.

**O que estava errado:** a Ana pediu uma auditoria do fluxo de links do
Canva porque usa a opção **"Link do modelo"** especificamente para que
cada comprador receba uma cópia independente do design (seção 3 acima).
Resolvendo os shortlinks via API do Canva (`resolve-shortlink`), ficou
confirmado que:

- O link que os pedidos da Ana chamavam de **"editável"** (mapeado pra
  `canvaUrl`, exposto pelo botão) resolvia consistentemente para
  `.../edit?...&utm_medium=link2&utm_source=sharebutton` — o link de
  **"Qualquer pessoa com o link pode editar"** do Canva (edição
  colaborativa do arquivo ao vivo, sem gerar cópia).
- O link que os pedidos chamavam de **"modelo/preview"** ou
  **"original"** (nunca exposto, documentado só internamente) resolvia
  consistentemente para
  `.../view?...&utm_medium=link&utm_source=publishsharelink&mode=preview`
  — esse sim é o **Template Link** de verdade (Compartilhar → Ver mais
  opções → Link de modelo), que gera cópia independente ao clicar.

Ou seja: os dois links estavam com os papéis **invertidos** em relação à
seção 3 deste documento (que já definia corretamente o que cada um devia
ser) — `canvaUrl` apontava pro link de edição colaborativa, não pro
Template Link.

**Escopo do problema (auditoria completa, 2026-09-22):** todos os 64
templates cadastrados até então foram verificados individualmente via
`resolve-shortlink` (o candidato a link correto de cada um já estava
documentado por template nas subseções "Template N — dados de teste" /
"Apresentação..." / "Kit Institucional Advocacia..." acima, como
`original_canva_url` ou `model/preview` — nenhum link novo foi pedido à
Ana). Resultado:

| # | Situação |
|---|---|
| 64 | Templates existentes no catálogo |
| 63 | Estavam com `canvaUrl` = link `/edit` (errado) |
| 63 | Corrigidos para o Template Link correto (`/view?...mode=preview`) |
| 1 | Já estava correto (`template01`) |
| 0 | Sem Template Link disponível nos dados existentes (nenhum) |

**A correção em código (`src/lib/templates.ts`):** só o valor de
`canvaUrl` foi trocado, template por template, pelo link já documentado
como "modelo/preview"/"original" de cada um — confirmado individualmente
via `resolve-shortlink` antes da troca. Nada mais mudou: `id`, `slug`,
`title`, `category`, `description`, imagens, ordem no array, `kitSlug`,
`aspectRatio`, `createdAt` — todos intocados. Nenhum template novo
criado, nenhuma arte do Canva alterada.

**Regra definitiva, daqui pra frente:**

- `canvaUrl` é **exclusivamente** o Template Link do Canva
  (`/view?...&utm_source=publishsharelink&mode=preview`) — o link
  "Compartilhar → Ver mais opções → Link de modelo".
- `canvaUrl` **nunca** pode ser um link de edição colaborativa
  (`/edit?...&utm_source=sharebutton`, "Qualquer pessoa com o link pode
  editar").
- O master do Canva **nunca** é entregue ao comprador, em nenhuma forma.
- **"Editar no Canva"** (`EditInCanvaButton`) sempre usa `canvaUrl` — ao
  clicar, o Canva cria uma cópia independente pro comprador; o arquivo
  original nunca é alterado, e um comprador nunca pode editar a cópia de
  outro.
- **"Baixar modelo pronto"** (`DownloadTemplateButton`, novo nesta
  correção) entrega a arte exatamente como está — as mesmas imagens já
  usadas no preview (`previewImageUrl`/`carouselImageUrls`) — sem tocar
  no Canva. **Nunca usa `canvaUrl`.**
- **Todo cadastro futuro** deve confirmar, via `resolve-shortlink` (ou
  teste manual do link), que o candidato a `canvaUrl` resolve para o
  padrão `/view?...mode=preview` **antes** de gravar — nunca assumir pelo
  rótulo que a Ana usar no pedido ("editável", "modelo", etc.), já que
  foi exatamente essa suposição que causou o erro em 63 dos 64 templates.

## 3.4. Pasta "Apresentações" — reorganização do Kit Social Media (2026-09-25)

**Pedido da Ana:** separar visualmente as apresentações (misturadas com
templates de Feed/Carrossel/checklists na página do kit) numa área
própria, acessível por um card-pasta de destaque — sem criar duplicatas
nem alterar nenhum link cadastrado.

**Decisão de modelagem — reaproveitar `category: "Apresentação"` em vez
de criar um "pack" novo:** o schema conceitual (seção 4) já prevê
`kits → packs → templates`, mas `packSlug` nunca foi implementado como
entidade real (nenhum `Pack`, nenhum `packs.ts`, nenhum template com
`packSlug` preenchido). Em vez de construir essa camada nova só pra
isso, a pasta "Apresentações" usa o mesmo filtro que o `KitCard`
(`src/components/kits/KitCard.tsx`) já aplicava desde 2026-09-20 pra
excluir "Apresentação" da vitrine decorativa do kit — ou seja, o
próprio código já tratava esse grupo como visualmente distinto dos
posts. Formalizar isso como a definição da pasta significa: nenhum
template alterado (nenhum `id`, `slug`, `canvaUrl`, imagem ou posição no
array mudou), zero risco de duplicata, e qualquer template futuro com
`category: "Apresentação"` nesse (ou em qualquer outro) kit entra na
pasta automaticamente — sem editar página nenhuma, cumprindo o pedido de
escalabilidade da Ana.

**O que foi construído:**
- `src/components/presentations/PresentationFolderCard.tsx` — card novo,
  fora do grid denso de templates: pilha de 3 capas reais sobrepostas
  (mesmas imagens do `TemplatePreview`, nunca recriadas/redesenhadas),
  badge "Coleção", título "Apresentações", descrição "Materiais para
  apresentar aos seus clientes" e CTA "Ver apresentações →". Um único
  `<Link>` pra `/kits/[slug]/apresentacoes`.
- `src/app/kits/[slug]/apresentacoes/page.tsx` — rota nova, genérica
  (não hardcoded pro Kit Social Media): lista todos os templates
  `category === "Apresentação"` do kit em cards (`TemplateCard`
  reaproveitado, mesmo componente do catálogo), com link "← Voltar ao
  Kit {título}". 404 se o kit não existe ou se não há nenhuma
  apresentação cadastrada.
- `src/app/kits/[slug]/page.tsx` — passou a separar `kitTemplates` em
  `apresentacoes` (vira o card-pasta, primeiro elemento depois do
  cabeçalho) e `outrosMateriais` (grid de sempre, agora sem
  "Apresentação"). Testado no Kit Social Media (19 apresentações saem do
  grid, viram a pasta; 51 templates de Feed/Carrossel continuam no grid
  normal) e no Kit Institucional Advocacia (nenhum template
  `category: "Apresentação"` lá — página segue idêntica, sem pasta,
  confirmando que a mudança não afeta kits sem apresentações).

**Acesso:** nenhuma regra nova — `EditInCanvaButton`/
`DownloadTemplateButton` de cada apresentação continuam exatamente como
estavam, mesma regra global `hasPaidAccess` (seção 3.1). A pasta é só
uma forma diferente de chegar aos mesmos templates, não uma unidade de
venda separada (seção 6).

**Verificado ao vivo:** navegação pasta → área de apresentações → volta
pro kit (os três links testados via clique real no navegador); as 19
capas reais aparecem na área nova; grid do Kit Social Media sem nenhum
item "Apresentação" restante; Kit Institucional Advocacia inalterado;
responsivo em mobile (375px, sem overflow horizontal) e desktop
(1280px, layout lado a lado do card-pasta); sem erros de console além
do ruído conhecido de HMR.

## 4. Estrutura de dados

### Campos do template

| Campo                | Conteúdo                                 | Visibilidade                              |
| --------------------- | ----------------------------------------- | ------------------------------------------ |
| `preview_image_url`  | PNG exportado do master (1080×1350)      | Pública                                    |
| `original_canva_url` | Link do master, intocável                | Interna — nunca em API pública/frontend    |
| `canva_editable_url` | Template Link do Canva                   | Só com `hasPaidAccess === true` (global — ver seção 3.1) |

**Validação obrigatória:** impedir que `original_canva_url` e
`canva_editable_url` sejam cadastrados com o mesmo valor.

### Schema conceitual (Supabase / Postgres)

```
kits (id, slug, nome, descricao, status, created_at)
  └── packs (id, kit_id fk, slug, nome, ordem, created_at)
        └── templates (id, pack_id fk, nome, descricao, categoria, preco,
                        preview_image_url, original_canva_url,
                        canva_editable_url, status, ordem,
                        created_at, updated_at)

tags (id, nome unique)
template_tags (template_id fk, tag_id fk)   -- N:N
```

Relacionamento: `kits (1) → packs (N) → templates (N)`, `tags` em N:N via
`template_tags`.

**Preparar mas não construir ainda:** `purchases` (registra o pagamento —
um único registro por usuário desbloqueia tudo, **não** por kit/template),
`users`/`profiles` (com algo como `hasPaidAccess`, global — ver 3.1).

### RLS

- `preview_image_url`: policy pública.
- `original_canva_url`: sem policy pública — só service role; frontend nunca
  busca esse campo.
- `canva_editable_url`: só libera leitura se o usuário tiver
  `hasPaidAccess === true` — verificação **global**, igual para qualquer
  kit/pack/template, nunca "comprou esse item específico" (ver seção 3.1).

## 5. Fluxo técnico do comprador

1. Master privado, nunca consultado pelo app.
2. Exportação manual do PNG → `preview_image_url`.
3. Template Link gerado a partir do master → `canva_editable_url`.
4. Visitante: Home → Categoria → Kit → Template → Preview (só
   `preview_image_url`, sem nenhum link do Canva) — Kits/Templates aqui são
   vitrine, não unidade de compra.
5. Pagamento confirmado → `hasPaidAccess = true` para aquele usuário
   (global, não vinculado a um kit/template específico).
6. "Meus Templates" (ou o próprio catálogo) → botão "Editar no Canva"
   visível em **todos** os templates.
7. Clique → app verifica `hasPaidAccess` (RLS) → libera `canva_editable_url`
   daquele template.
8. Canva cria cópia independente na conta do comprador.
9. Comprador edita livremente a própria cópia.

## 6. Escalabilidade — princípios que não podem ser quebrados

- Nada hardcoded em componentes: nome, quantidade, preço, link, categoria.
- Cadastrar template = Canva (master) → exportar PNG → gerar Template Link →
  preencher planilha/admin → sincronizar com `templates`. **Sem alteração de
  código.**
- Venda é **um único acesso pago = Mosaico inteiro** (ver seção 3.1) — nada
  de comprar Kit A separado do Kit B. Categorias/tags/organização por kit
  continuam livres para crescer sem redesenho; é só a cobrança que é única.
- Um KIT é uma coleção de templates; um TEMPLATE é uma unidade dentro dela —
  mas nenhum dos dois é vendido separadamente.

## 7. Terminologia — interno vs interface

`master`, `original_canva_url`, `canva_editable_url`, `Template Link`,
`entitlement` são só internos (código/banco/docs). Na interface: apenas
**"Preview"** (antes da compra) e **"Editar no Canva"** (depois da compra).

## 8. Como Ana quer o trabalho conduzido

- Processo iterativo, aprovação por etapa — nenhum código antes de cada fase
  ser revisada e aprovada. Preferência firme.
- Decisões apresentadas como opções claras, não suposições.
- Perguntas de esclarecimento antes de prosseguir quando um pedido for
  ambíguo.
- Antes de alterar arquivos: analisar estrutura real do projeto primeiro,
  identificar onde a nova lógica se encaixa, preservar o que já funciona, não
  recriar do zero.

## 9. Estado do projeto

- 2026-09-14: nada do "Etapa 3/4 concluída" relatado em conversas anteriores
  existia de fato em código — este repositório começou do zero nesta data.
- Fase 1 aprovada: scaffolding (Next.js + TS + Tailwind, tokens de design
  institucionais, estrutura de pastas) + seção Hero da landing como prova de
  conceito visual.
- Supabase: projeto ainda não criado — `.env.example` com placeholders.
  **Ainda verdadeiro em 2026-09-17**: nenhum client Supabase, nenhuma tabela,
  nenhuma policy de RLS existe em código — tudo na seção 4 continua sendo
  schema conceitual, não implementado.
- Sem Homebrew/`gh` CLI disponíveis nesta máquina; Node instalado via nvm.
  **Atualizado em 2026-09-17**: `gh` CLI foi instalado manualmente em
  `~/bin` (sem Homebrew) e autenticado via `gh auth login` (device flow) +
  `gh auth setup-git` (necessário para o credential helper do `git push`
  funcionar). Em qualquer sessão nova, rodar
  `export PATH="$HOME/bin:$PATH"` antes de usar `gh`/`git push`.

### 9.1. Estado em 2026-09-17 (fim de sessão) — para continuar depois

**Templates cadastrados:** 22 templates reais (Template 01 a Template 22),
todos no Kit Social Media — Templates 01-12, 21 e 22 categoria "Carrossel",
Templates 13-20 categoria "Feed" (página única — correção de 2026-09-18,
ver seção "Correção de categoria — Templates 14 a 18" acima) —, todos com
preview real
(PNG) e `canvaUrl` funcionando — nenhum dado inventado. Detalhes completos
de cada um (links, contagem de páginas, discrepâncias de numeração
observadas nas peças) estão nas subseções "Template N — dados de teste"
acima. Resumo rápido:

| # | Tema | Páginas | `canva_editable_url` |
|---|------|---------|----------------------|
| 01 | 5 erros que estão impedindo seu conteúdo de performar | 7 | (removido — Fase 0 de segurança) |
| 02 | O que postar quando você está sem ideias? | 7 | (removido — Fase 0 de segurança) |
| 03 | 7 tipos de conteúdo que todo perfil deveria ter | 7 (de 8 no roteiro) | (removido — Fase 0 de segurança) |
| 04 | Como criar conteúdo que gera identificação | 6 (de 7 no roteiro) | (removido — Fase 0 de segurança) |
| 05 | Conteúdo que informa × conteúdo que vende | 7 (completo) | (removido — Fase 0 de segurança) |
| 06 | O que é um conteúdo estratégico? | 6 | (removido — Fase 0 de segurança) |
| 07 | Como encontrar assuntos para o seu calendário | 6 | (removido — Fase 0 de segurança) |
| 08 | 3 perguntas antes de criar qualquer post | 7 | (removido — Fase 0 de segurança) |
| 09 | Por que seu conteúdo não está gerando interação? | 6 (de ~7) | (removido — Fase 0 de segurança) |
| 10 | Como transformar uma ideia em vários conteúdos | 5 (de ~7) | (removido — Fase 0 de segurança) |
| 11 | Seu feed está comunicando o que sua marca é? | 7 (completo) | (removido — Fase 0 de segurança) |
| 12 | 5 elementos de um perfil profissional | 7 | (removido — Fase 0 de segurança) |
| 13 | Bio que explica quem você é em poucos segundos (Feed, página única) | 1 | (removido — Fase 0 de segurança) |
| 14 | Antes de postar: o que analisar (Feed) | 1 | (removido — Fase 0 de segurança) |
| 15 | Feed bonito não é sinônimo de feed estratégico (Feed) | 1 | (removido — Fase 0 de segurança) |
| 16 | 3 sinais de que seu perfil precisa de uma mudança (Feed) | 1 | (removido — Fase 0 de segurança) |
| 17 | Como criar uma identidade visual consistente (Feed) | 1 | (removido — Fase 0 de segurança) |
| 18 | O que ninguém te conta sobre crescer no Instagram (Feed) | 1 | (removido — Fase 0 de segurança) |
| 19 | Você está falando com seu público ou com todo mundo? (Feed) | 1 | (removido — Fase 0 de segurança) |
| 20 | Checklist antes de publicar um conteúdo (Feed) | 1 | (removido — Fase 0 de segurança) |
| 21 | 5 erros visuais que deixam seu perfil amador (Carrossel, completo) | 7 | (removido — Fase 0 de segurança) |
| 22 | Como escolher fontes para sua marca (Carrossel, completo) | 7 | (removido — Fase 0 de segurança) |

Templates 09 a 22 têm uma particularidade: os links "editável" e
"modelo/master" que a Ana enviou resolvem para o **mesmo `design_id`** no
Canva (verificado via `resolve-shortlink` antes de cada cadastro) — não são
dois arquivos separados como nos Templates 01-08. Isso não bloqueou nenhum
cadastro; só está documentado por transparência em cada subseção acima.

**Páginas e componentes implementados (verificado em código, não é plano):**

```
src/app/page.tsx                          → Home (Hero + WhyMosaicoSection + KitsSection)
src/app/kits/[slug]/page.tsx               → Página de um kit (grade de templates)
src/app/templates/[slug]/page.tsx          → Página de detalhe de um template

src/components/sections/Hero.tsx
src/components/sections/WhyMosaicoSection.tsx
src/components/sections/KitsSection.tsx
src/components/kits/KitCard.tsx
src/components/templates/TemplateCard.tsx        → card na grade do kit
src/components/templates/TemplateDetail.tsx      → conteúdo da página de detalhe
src/components/templates/TemplateGallery.tsx     → carrossel client-side ("use client"),
                                                    usado quando carouselImageUrls.length > 1
src/components/templates/TemplatePreview.tsx     → miniatura/preview (placeholderStyle:
                                                    "decorative" no Hero, "pending" nas páginas reais)
src/components/templates/EditInCanvaButton.tsx     → renderiza canvaUrl (Template Link) sem
                                                      nenhuma trava hoje
src/components/templates/DownloadTemplateButton.tsx → "Baixar modelo pronto" (2026-09-22): baixa
                                                      previewImageUrl/carouselImageUrls direto,
                                                      nunca canvaUrl; monta .zip no navegador
                                                      (lib jszip) quando há mais de 1 página
src/components/ui/Container.tsx
src/components/ui/PhoneMockup.tsx

src/lib/templates.ts   → getAllTemplates()/getTemplateBySlug() — mock, ver nota no topo do arquivo
src/lib/kits.ts        → getAllKits()/getKitBySlug() — mock, 11 kits (só Social Media tem templates reais)
src/types/template.ts  → Template, TemplateSummary, TemplateCategory, TemplateAspectRatio
src/types/kit.ts       → Kit
```

**Controle de acesso (`hasPaidAccess`) — confirmado em 2026-09-17: ainda
não existe em código.** Busca por `hasPaidAccess` em `src/` não retorna
nenhum resultado; não há autenticação, middleware, Supabase client ou
qualquer lógica de gate. `EditInCanvaButton` renderiza `canvaUrl` como link
direto (`<a href>`) para **qualquer visitante**, sem checar pagamento. A
regra da seção 3.1 (pagamento único = acesso global a tudo) é o design
pretendido e deve orientar a futura implementação — mas hoje é só
documentação, não comportamento real do site. Isso já foi comunicado
diretamente à Ana nesta sessão.

**Ambiente:** repo em `/Users/ana/mosaico`, remote
`https://github.com/vanasconcelos/mosaico.git` (privado), branch `main`
único (sem outras branches). Autoria dos commits: Ana Clara Vasconcelos +
`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

**Próximos passos possíveis (nenhum decidido/autorizado ainda — não
começar sem a Ana pedir):** criar projeto Supabase e ligar `.env.example`;
implementar `hasPaidAccess` de verdade (auth + RLS + gate no
`EditInCanvaButton`); demais seções da landing além de Hero/Why/Kits
(galeria maior de produto, "o que está incluído", "como funciona", FAQ,
CTA de compra — ver estrutura original de 11 seções mencionada em sessões
anteriores); cadastro de templates em outros kits além do Social Media
(nenhum tem conteúdo real ainda).

### 9.2. Verificação visual ao vivo — 2026-11-01

**Classificação: Experiência e interface — verificada nas páginas e
resoluções testadas, com ressalvas documentadas.**

Inspeção visual realizada no servidor de desenvolvimento já em execução
(`localhost:3000`), navegando de verdade com o navegador — não é leitura
de código.

**Páginas verificadas:** `/`, `/kits`, `/kits/social-media`,
`/kits/psicologia`, `/login`, `/cadastro`.

**Resoluções testadas:** 375px (mobile), 768px (tablet), 1280px (desktop).

**Resultados:**
- Identidade visual consistente nas páginas e larguras verificadas, com
  Fraunces, Karla e a paleta creme/vinho.
- O catálogo (`/kits`) diferencia visualmente kits disponíveis dos kits
  em preparação.
- Kits sem conteúdo não apresentam CTA de compra.
- Os formulários de `/login` e `/cadastro` apresentam hierarquia visual e
  instruções claras.
- Nenhum erro de console ou falha de rede foi observado durante a
  navegação realizada.
- Nenhum problema de sobreposição, corte de texto ou rolagem horizontal
  foi identificado nas larguras testadas.

**Ressalvas:**
- `/kits/psicologia` não teve captura visual própria nesta verificação;
  sua avaliação foi principalmente estrutural e textual.
- `/kits/social-media` teve confirmação visual em 768px (tablet), mas a
  avaliação em 375px (mobile) foi principalmente estrutural.
- As demais rotas do projeto (`/kits/[slug]/apresentacoes`,
  `/kits/[slug]/conteudo-juridico`, `/templates/[slug]`, `/conta`,
  `/recuperar-senha`, `/atualizar-senha`) não foram verificadas nesta
  etapa.
- A inspeção ocorreu em ambiente de desenvolvimento, não em produção.
- Os resultados acima são evidências da navegação realizada nas páginas e
  resoluções listadas — não constituem certificação de segurança,
  acessibilidade ou funcionamento de pagamentos.

## 10. Referência externa — Canva Combo (Julia Pretti)

Analisada em 2026-09-14 (site indicado pela Ana) para calibrar direção de
negócio e visual. Decisões tomadas a partir dela:

- **Estrutura kit/pack confirmada como estava:** kits continuam por nicho
  profissional (não por estilo visual universal, como na referência — lá os
  "packs" Craft/Classy/Minimal/Bold servem qualquer profissão; no Mosaico
  cada kit é uma profissão e os packs são subdivisões daquele nicho).
- **Kit Social Media é o mais complexo:** além dos templates de post
  (Feed/Story/Carrossel), inclui materiais para o profissional de social
  media apresentar aos **próprios clientes dele** (propostas, relatórios de
  resultado). Modelagem decidida: novo valor em `templates.categoria`
  (ex.: "Apresentação"), sem campo de formato/dimensões separado por ora.
- **Direção visual da home institucional:** testadas duas versões lado a
  lado (A — editorial-neutro; B — "Ghost Type + Foto Sobreposta", Padrão 1 do
  sistema de composição, aplicado à paleta institucional). **Decisão: A
  (editorial-neutro)** — a home mantém o tom contido/SaaS; o padrão ousado de
  tipografia gigante fica reservado para as páginas de cada kit (ex.: página
  do Kit Advogados, Kit Social Media/Índice), não para a home. Componente de
  referência para isso: `src/components/sections/HeroBold.tsx` (sem uso
  atualmente, mantido como ponto de partida).
- Elementos estruturais da referência que podem valer para páginas de
  kit/produto no futuro (ainda não decidido): grade de nichos atendidos,
  seção "como funciona" numerada com prints reais do Canva, FAQ, bio da
  criadora. Não implementados ainda — trazer para decisão quando chegarmos
  nas páginas de kit.

> Nota (2026-09-14 seguinte): a direção visual do Hero passou por mais duas
> rodadas depois desta decisão (parede-mosaico de templates, descartada; e
> a versão atual, seguindo a lógica de referência de
> `angelagiakas.com/template-club` — duas colunas, mockup de celular com
> grid denso). `HeroBold.tsx` foi removido nesse processo. Ver o código e o
> histórico de commits como fonte de verdade sobre o Hero atual — esta
> seção documenta só a decisão histórica do Canva Combo.

## 11. Correção — modelo de acesso e pagamento (2026-09-14, mesma sessão)

Substitui qualquer suposição anterior de compra por kit/pack/template
individual (nenhuma chegou a ser implementada em código). Regra definitiva
documentada na seção 3.1: **um único pagamento libera acesso a todos os
Kits, Packs e Templates** — não existe "comprou só o Kit A". Antes do
pagamento, Kits/Templates aparecem na landing só como vitrine/preview.
Controle de acesso (`hasPaidAccess`) é global por usuário, nunca por item.
