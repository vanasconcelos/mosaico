# Levantamento — Páginas Legais e Comerciais do Mosaico

Documento de levantamento, Etapa 2.5. **Não é conteúdo jurídico pronto para publicação** — é o inventário técnico do que o sistema realmente coleta e faz, mais a estrutura proposta das páginas, para servir de base a uma redação final (sua, ou com apoio jurídico). Nada aqui foi publicado nem implementado como página.

Nenhuma declaração de conformidade legal (LGPD ou outra) é feita neste documento — só fatos técnicos verificados no código e pontos explicitamente marcados como pendentes de decisão ou revisão jurídica.

---

## 1. Inventário dos dados e fluxos encontrados

### 1.1 Estrutura atual do rodapé

**Não existe rodapé no projeto hoje.** Busquei por qualquer componente `Footer` ou marcação equivalente em `src/components/` e `src/app/` — nenhum resultado. O único elemento de navegação persistente é o cabeçalho ([SiteHeader.tsx](src/components/layout/SiteHeader.tsx)). Isso significa que a estrutura para abrigar os links de Política de Privacidade/Termos/informações comerciais **precisa ser criada do zero**, não só editada.

### 1.2 Páginas existentes

`/`, `/kits`, `/kits/[slug]`, `/kits/[slug]/apresentacoes`, `/kits/[slug]/conteudo-juridico`, `/templates/[slug]`, `/login`, `/cadastro`, `/recuperar-senha`, `/atualizar-senha`, `/conta`. Nenhuma página de conteúdo institucional (sobre, contato, políticas) existe.

### 1.3 Formulários de cadastro e login — dados coletados diretamente do usuário

Busquei todos os formulários do projeto ([`actions.ts`](src/app/(auth)/actions.ts) e as quatro páginas de autenticação) — são os únicos pontos de coleta de dados pessoais de todo o sistema:

| Formulário | Campos coletados |
|---|---|
| Cadastro | e-mail, senha |
| Login | e-mail, senha |
| Recuperação de senha | e-mail |
| Atualização de senha | nova senha |

**Nenhum outro dado é pedido em nenhum formulário** — não há nome, telefone, CPF, endereço, data de nascimento, nem qualquer campo de newsletter ou contato. Confirmado por busca (`grep`) por todo uso de `FormData`/`<form` no projeto.

### 1.4 Dados efetivamente armazenados pelo sistema

Da estrutura real do banco ([`0001_schema.sql`](supabase/migrations/0001_schema.sql), já auditada em fases anteriores):

- **`profiles`**: `id` (vinculado ao usuário do Supabase Auth), `email`, `has_paid_access` (booleano), `created_at`.
- **`purchases`**: `user_id`, `provider` (sempre `"mercadopago"`), `provider_event_id`, `provider_event_at`, `status`, `amount_cents`, `created_at`, `updated_at`.

**O que NÃO é armazenado pelo Mosaico, em nenhum momento:** número de cartão, CVV, nome do titular do cartão, CPF, endereço de cobrança/entrega. O Checkout Pro do Mercado Pago é um redirecionamento — o comprador insere os dados de pagamento numa página do próprio Mercado Pago, nunca numa página do Mosaico.

### 1.5 Cookies e rastreamento

Busquei por qualquer uso de cookies/rastreamento no projeto. **O único uso de cookies é o de sessão de autenticação do Supabase** (`sb-*`, gerenciado por `@supabase/ssr` em [`proxy.ts`](src/proxy.ts) e [`lib/supabase/server.ts`](src/lib/supabase/server.ts)) — necessário para manter o usuário logado, não para rastreamento. **Não há Google Analytics, Meta/Facebook Pixel, nem qualquer outro cookie de terceiros ou de marketing no projeto hoje.**

### 1.6 Integração com Supabase Auth

GoTrue (serviço de autenticação do Supabase) armazena e-mail e a senha com hash (nunca em texto plano — confirmado por documentação oficial e por auditoria de segurança anterior, Fase 1.11). Envia e-mails de confirmação de cadastro e de recuperação de senha — **o provedor de envio desses e-mails (SMTP padrão do Supabase ou um customizado) não foi verificável com as ferramentas desta sessão** (já registrado como pendência na Fase 1.11).

### 1.7 Integração com Mercado Pago

Checkout Pro (redirecionamento) — [`checkout/route.ts`](src/app/api/checkout/route.ts) só envia: identificador do comprador (`external_reference`, o `id` do usuário no Supabase — nunca e-mail ou nome), preço fixo do servidor, descrição do produto. O retorno é só via webhook assinado ([`webhooks/mercadopago/route.ts`](src/app/api/webhooks/mercadopago/route.ts)), que traz status do pagamento, valor e o `external_reference` — nunca dado de cartão.

### 1.8 Fluxo de compra e entrega

Pagamento único → webhook confirma → acesso (`has_paid_access`) liberado → comprador acessa `/conta`, a galeria de cada template (URLs assinadas, 60 segundos de validade) e o download em `.zip` — todos atrás de checagem de sessão + `has_paid_access` no servidor (já auditado e testado extensivamente nas Etapas 2.2B/2.2C/2.3).

### 1.9 Suporte e contato — informação já presente no projeto

**Nenhuma.** Já confirmado em etapa anterior (verificação exaustiva por e-mail de contato documentado, antes de qualquer decisão sobre o bloco "Fale conosco" da FAQ): nenhum e-mail, telefone, formulário de contato ou canal de suporte está documentado ou implementado em nenhum lugar do projeto.

---

## 2. Estrutura proposta das páginas

Proposta de três páginas novas, no mesmo grupo de rotas institucionais (ex.: `/politica-de-privacidade`, `/termos-de-uso`, `/sobre` ou equivalente para as informações comerciais — nome exato a definir).

### 2.1 Política de Privacidade — tópicos e o que já se sabe

| Tópico | Conteúdo técnico já confirmado | O que falta |
|---|---|---|
| Dados pessoais coletados | E-mail e senha (cadastro/login); nenhum outro campo pessoal (seção 1.3-1.4) | — |
| Finalidades | Autenticar o usuário e controlar acesso ao conteúdo pago — única finalidade técnica observável no código | **Base legal de tratamento (LGPD) a confirmar com apoio jurídico** — não presumo qual artigo/base se aplica |
| Operadores envolvidos | Supabase (autenticação, banco de dados, hospedagem de arquivos) e Mercado Pago (processamento de pagamento) — os dois únicos serviços de terceiros integrados ao sistema (confirmado por todo o código já auditado) | Nome legal completo e localização de cada operador, se exigido pelo formato final do documento |
| Compartilhamento de dados | O identificador do usuário (não o e-mail) é compartilhado com o Mercado Pago só como `external_reference`, para vincular o pagamento à conta — nenhum outro compartilhamento existe no código | — |
| Retenção e exclusão | **Não há, no código, nenhuma rotina de exclusão ou expiração de dados** — nenhum processo de "exclusão de conta" foi encontrado em nenhuma rota | **Decisão de produto/jurídica pendente**: por quanto tempo os dados ficam retidos, e se/como um usuário pode pedir exclusão |
| Direitos dos titulares | — | **Pendente de redação jurídica** — direitos de acesso, correção, exclusão, portabilidade etc., e como o Mosaico de fato processaria cada um na prática (hoje não há nenhum mecanismo automatizado) |
| Canal de contato para privacidade | — | **Pendente — depende do e-mail/canal oficial que ainda não existe (seção 3)** |

### 2.2 Termos de Uso — tópicos e o que já se sabe

| Tópico | Conteúdo técnico já confirmado | O que falta |
|---|---|---|
| Funcionamento da plataforma | Pagamento único libera acesso permanente a todos os kits incluídos (confirmado em código e copy da FAQ/home) | — |
| Natureza dos produtos | Templates editáveis no Canva — entregues como link de edição (Canva) e/ou arquivo `.zip` de imagens, conforme já implementado | — |
| Processo de compra e acesso | Checkout Pro (Mercado Pago) → webhook confirma → acesso liberado via `/conta` | — |
| Regras de uso dos templates | **Não encontrei, em nenhum lugar do código ou da documentação do projeto, uma regra explícita sobre o que o comprador pode/não pode fazer com os templates** (ex.: uso comercial próprio permitido, revenda proibida, redistribuição do arquivo original proibida) | **Pendente — decisão sua, não técnica.** Não vou presumir nem copiar de outra plataforma, conforme instruído |
| Limitações e responsabilidades | — | **Pendente de redação jurídica** |
| Cancelamento e reembolso | **Não existe, no código ou na documentação, nenhuma política de reembolso definida.** A coluna `purchases.status` aceita o valor técnico `'refunded'` (o sistema sabe *processar* um reembolso vindo do Mercado Pago e revogar o acesso corretamente — já testado), mas isso é só a capacidade técnica, não uma política comercial sobre quando/se um reembolso é concedido | **Pendente — decisão sua.** Não vou inventar prazo nem condição de reembolso |
| Suporte | — | **Pendente — depende do canal oficial (seção 3)** |
| Propriedade intelectual | — | **Pendente de redação jurídica**, mas com um fato técnico relevante: os templates vêm do Canva (ver `original_canva_url`/`canva_editable_url`, já auditados) — a página deveria provavelmente mencionar a relação com os termos do próprio Canva, mas isso exige confirmação sua sobre como você quer posicionar isso |

### 2.3 Informações comerciais — tópicos e o que já se sabe

| Tópico | Status |
|---|---|
| Responsável pela operação | **Não encontrado em nenhum lugar do projeto.** Não presumo seu nome nem CPF/CNPJ pessoal para isso |
| Nome empresarial | **Não encontrado.** Nenhuma menção a razão social em código ou documentação |
| CNPJ | **Não encontrado. Não inventado**, conforme instruído explicitamente |
| E-mail/canal oficial de atendimento | **Não existe — mesma pendência já identificada em etapa anterior desta auditoria (pedido de bloco "Fale conosco" na FAQ, ainda sem resposta sua)** |
| Prazo e forma de resposta ao consumidor | **Não definido em nenhum lugar** |

**Nenhuma dessas cinco informações pode ser preenchida por mim — todas dependem inteiramente de dados que só você tem.**

---

## 3. Informações que faltam (consolidado)

1. E-mail ou canal oficial de contato/suporte (pendência já aberta antes desta etapa).
2. Identificação do responsável pela operação (pessoa física/CNPJ, nome empresarial).
3. Política de reembolso (prazo, condições).
4. Regras de uso dos templates (uso comercial próprio, revenda, redistribuição).
5. Política de retenção/exclusão de dados.
6. Prazo de resposta ao consumidor.
7. Confirmação do provedor de e-mail do Supabase Auth (relevante para mencionar na Política de Privacidade quem processa os e-mails enviados).

## 4. Pontos que exigem revisão jurídica

- Base(s) legal(is) de tratamento de dados sob a LGPD aplicável a cada finalidade.
- Texto formal dos direitos dos titulares e o processo real para atendê-los.
- Cláusulas de limitação de responsabilidade e propriedade intelectual.
- Qualquer menção a conformidade com a LGPD ou outra legislação — **este documento, deliberadamente, não afirma conformidade com nada**.
- Validação final de que o conteúdo das três páginas, quando redigido, reflete com precisão o que o código efetivamente faz (recomendo uma nova leitura cruzada depois que as páginas forem escritas, antes de publicar).

## 5. Sugestão de integração ao rodapé e ao checkout

**Rodapé (a ser criado — não existe hoje):** um componente `SiteFooter`, com os links para as três páginas (Política de Privacidade, Termos de Uso, informações comerciais/contato), presente em todas as páginas via `layout.tsx` — mesmo padrão já usado para o `SiteHeader`.

**Checkout:** um texto curto e um link para os Termos de Uso (e, se você decidir, também a Política de Privacidade) próximo ao botão "Comprar acesso" ([`ComprarAcessoButton.tsx`](src/components/conta/ComprarAcessoButton.tsx)), do tipo "Ao continuar, você concorda com os Termos de Uso" — texto final a ser decidido junto com o conteúdo das páginas, não implementado nesta etapa.

**Cadastro:** pelo mesmo motivo, normalmente há uma referência aos Termos/Privacidade na tela de criação de conta ([`cadastro/page.tsx`](src/app/(auth)/cadastro/page.tsx)) — sugestão a avaliar junto com você quando o conteúdo estiver pronto.

Nenhuma dessas integrações foi implementada nesta etapa — é só a proposta de onde elas se encaixariam.

---

**Confirmação:** este documento não declara conformidade legal com nada. Todo item marcado "pendente" ou "a confirmar" depende de informação ou decisão sua (ou de revisão jurídica), não foi inventado, e não foi copiado de nenhuma outra plataforma.
