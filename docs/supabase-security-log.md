# Histórico técnico de auditorias e execuções de segurança — Supabase (Mosaico)

Este documento registra auditorias de segurança e execuções de correção
realizadas diretamente no projeto Supabase do Mosaico (`mosaico-sp`,
Project Ref `irfmkiikyquqjmasmzaj`) — permissões, RLS, privilégios padrão,
views e funções. Não cobre vulnerabilidades de dependências npm (ver
`docs/security-exceptions.md` para isso).

Cada entrada registra o que foi auditado ou executado, o resultado
verificado por leitura dos catálogos do Postgres, e, quando aplicável, o
que ficou pendente.

---

## 2026-11-01 — Fase 1.9: Privilégios padrão (`ALTER DEFAULT PRIVILEGES`) do schema `public`

**Status: concluída parcialmente, com limitação de permissão.**

**Contexto:** auditorias anteriores (Fases 1.3–1.8) identificaram que os
privilégios padrão configurados no schema `public` concediam
automaticamente, a qualquer tabela, view, função ou sequence nova, acesso
amplo (incluindo escrita e `MAINTAIN`) para `anon` e `authenticated` — o
mesmo mecanismo que causou o incidente real, já corrigido, da view
`templates_preview`. A Fase 1.9 planejou e, mediante autorização, executou
seis comandos `ALTER DEFAULT PRIVILEGES` para remover essa concessão
automática, preservando integralmente os privilégios padrão de
`service_role`.

**Comandos executados com sucesso** (grantor `postgres`):

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;
```

Verificado por leitura de `pg_default_acl` após a execução: as três
entradas de `postgres` como grantor (tabelas/views, funções, sequences)
não concedem mais nada a `anon`/`authenticated`. `postgres` e
`service_role` permanecem com os mesmos privilégios de antes, em todas as
três.

**Comandos que falharam** (grantor `supabase_admin`):

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;
```

Os três falharam com `ERROR 42501: permission denied to change default
privileges`. Causa confirmada por leitura: a conexão usada para executar
os comandos opera como o papel `postgres`, que não é superusuário
(`rolsuper = false`) nem membro do papel `supabase_admin`
(`pg_has_role(..., 'MEMBER') = false`) neste projeto. No PostgreSQL,
alterar os privilégios padrão de um papel exige ser esse papel, ser membro
dele, ou ser superusuário — nenhuma dessas condições se aplicava.

**Estado resultante, verificado por leitura de `pg_default_acl`:**

| Grantor | Tabelas/views | Funções | Sequences |
|---|---|---|---|
| `postgres` | ✅ corrigido — `anon`/`authenticated` sem privilégio automático | ✅ corrigido | ✅ corrigido |
| `supabase_admin` | ⚠️ inalterado — `anon`/`authenticated` continuam recebendo privilégio total automático | ⚠️ inalterado | ⚠️ inalterado |

`service_role` foi integralmente preservado em todas as seis entradas,
como autorizado — nenhum comando o incluiu no `REVOKE`.

**Nenhum objeto existente foi afetado.** `ALTER DEFAULT PRIVILEGES` só rege
objetos criados *depois* do comando — nenhuma tabela, view, função,
sequence, ACL de objeto já existente, política RLS ou dado foi alterado
por esta execução.

**Risco residual, documentado e não corrigido:** qualquer tabela, view,
função ou sequence nova criada em `public` pelo papel `supabase_admin`
continuaria recebendo automaticamente privilégio amplo (incluindo escrita
e `MAINTAIN` em tabelas/views) para `anon` e `authenticated` — o mesmo
risco estrutural identificado na Fase 1.8, agora só parcialmente mitigado.

**Evidência relevante para avaliar a urgência real desse risco residual:**
analisei as sete migrations existentes do projeto (`0001_schema.sql` a
`0007_apply_purchase_event_consolidated.sql`) e **não encontrei nenhuma
evidência de que algum objeto tenha sido ou precise ser criado como
`supabase_admin`** — todas as tabelas, a view `templates_preview` e as
cinco funções do schema `public` têm `postgres` como proprietário, e todas
as migrations foram escritas para rodar como `postgres`. O risco é real
enquanto a configuração padrão de `supabase_admin` não for corrigida, mas
não há, até esta data, nenhum caminho conhecido do próprio projeto que o
exercite.

**Critérios para reabrir esta análise:**
- Obtenção de uma forma de executar comandos como `supabase_admin` (credencial própria, ou suporte da plataforma Supabase atuando em nome do projeto).
- Qualquer migration ou processo futuro que crie um objeto em `public` usando o papel `supabase_admin`.
- Mudança de plataforma pela Supabase que altere quem administra privilégios padrão do schema `public`.

**Referência:** relatórios completos das Fases 1.8 e 1.9 (auditoria,
planejamento e execução) estão registrados na conversa com a Ana — este
documento resume o resultado técnico verificável, não substitui o
relatório de cada fase.

---

## 2026-11-01 — Fase 1.10: Auditoria do Supabase Storage

**Status: auditoria concluída, sem vulnerabilidades confirmadas, com riscos
potenciais registrados.**

**Contexto:** toda a auditoria de segurança do Supabase até a Fase 1.9
cobriu exclusivamente o schema `public` (tabelas, views, funções, RLS,
privilégios padrão). O Supabase Storage — usado pelas rotas de download e
de geração de signed URLs do conteúdo pago — tem seu próprio modelo de
permissão (schema `storage`) e nunca havia sido examinado. A Fase 1.10
cobriu esse gap, com escopo somente leitura.

**Inventário do bucket:**

| Bucket | Público? | Limite de tamanho | Tipos MIME restritos |
|---|---|---|---|
| `template-assets` (único bucket existente) | **`false` — privado** | nenhum configurado | nenhum configurado |

**RLS e políticas em `storage.objects`:** RLS **ativado**
(`relrowsecurity = true`); **zero políticas** (`pg_policies` para
`schemaname = 'storage'` retorna lista vazia). RLS ativado sem nenhuma
política nega acesso a qualquer papel sem `bypassrls` — `anon` e
`authenticated` não têm `bypassrls` (confirmado nas Fases 1.5/1.8),
`service_role` tem.

**ACLs observadas:** `anon`/`authenticated` têm `GRANT` de
INSERT/SELECT/UPDATE/DELETE (`arwd`) em `storage.objects`/`storage.buckets`
— mas isso **não foi configurado por este projeto**: todo o schema
`storage` é de propriedade do papel de plataforma `supabase_storage_admin`,
provisionado automaticamente pela Supabase na criação do projeto, igual em
qualquer projeto novo. O `GRANT` sozinho não concede acesso de fato — como
não existe nenhuma política RLS permissiva, o resultado prático é bloqueio
total para `anon`/`authenticated`.

**Rotas analisadas** ([download/route.ts](src/app/api/templates/[slug]/download/route.ts),
[templates/[slug]/page.tsx](src/app/templates/[slug]/page.tsx)): ambas
seguem a mesma sequência — slug válido → sessão confirmada
(`auth.getClaims()`) → `profiles.has_paid_access` lido pelo client do
próprio usuário (respeita RLS `profiles_select_own`) → só então o
`service_role` (`createAdminClient()`) toca o bucket. `download/route.ts`
nunca expõe uma URL do bucket, só os bytes finais de um `.zip` montado no
servidor. `templates/[slug]/page.tsx` gera signed URLs com **TTL de 60
segundos**, geradas a cada requisição, nunca reutilizadas.

**Resultado: nenhuma vulnerabilidade confirmada.** Bucket privado, RLS
ativado sem políticas, e acesso exclusivamente via `service_role` atrás de
checagem de `has_paid_access` — três camadas independentes, nenhuma
dependendo só da outra.

**Riscos potenciais, não confirmados:**
- O `GRANT arwd` de `anon`/`authenticated` em `storage.objects` é um
  padrão de plataforma fora do controle direto deste projeto; hoje é
  inofensivo só porque não existe nenhuma política RLS permissiva — se uma
  política for criada no futuro sem revisão cuidadosa de escopo, esse
  `GRANT` já concedido passa a valer.
- Ausência de `file_size_limit`/`allowed_mime_types` no bucket — não é
  risco de confidencialidade (acesso já totalmente gated), mas é ausência
  de hardening operacional caso o `service_role` venha a aceitar upload de
  origem menos controlada no futuro (não é o caso hoje).

**Limitações da auditoria:**
- Não foi feita nenhuma chamada real contra a API de Storage com a chave
  `anon` para confirmar empiricamente o bloqueio (proibido pelo escopo
  desta fase) — a conclusão vem da combinação documentada de RLS vazio +
  `bypassrls = false`, já confirmada empiricamente em outro schema
  (`public.templates`) nas Fases 1.5/1.8.
- Não foi verificada a existência de CDN/cache externo na frente do
  endpoint de Storage que pudesse reter uma signed URL além do TTL de 60s
  — fora do alcance de uma consulta a catálogos do Postgres.

**Confirmação:** nenhuma alteração foi feita no Supabase, nenhum link real
foi gerado ou testado, nenhum arquivo foi acessado.

**Referência:** relatório completo da Fase 1.10 está registrado na
conversa com a Ana — este documento resume o resultado técnico
verificável, não o substitui.

---

## 2026-11-01 — Fase 1.11: Auth, extensões PostgreSQL e serviços (Edge Functions/Realtime)

**Status: auditoria concluída, sem novas vulnerabilidades confirmadas, com
limitações de visibilidade na configuração do Auth.**

**Contexto:** continuação da varredura sistemática das áreas do projeto
Supabase ainda não examinadas pelas Fases 1.3–1.10 — configuração do
serviço Auth, extensões PostgreSQL instaladas, Edge Functions e Realtime.

**Configuração do Auth:** não existe `auth.config` nem nenhuma tabela
equivalente no schema `auth` — confirmado por `list_tables`. A
configuração do serviço Auth (GoTrue) vive na Management API do Supabase
(`/v1/projects/{ref}/config/auth`), fora do alcance de qualquer ferramenta
disponível nesta sessão. Por isso, os seguintes itens ficam classificados
como **não verificáveis**, não como ausentes nem como configurados —
nenhuma suposição foi feita sobre o valor real de nenhum deles:
confirmação de e-mail obrigatória, duração/expiração de sessão (JWT),
política de comprimento/caracteres de senha, exigência de MFA, rate limits
de tentativas de login.

**Leaked Password Protection:** reconfirmado, via `get_advisors` (tipo
`security`), como **ainda desabilitado** — mesmo estado já registrado
antes da Fase 1.3, sem mudança.

**Tabelas de Auth consultadas (uso real, não política/configuração):**
- `auth.mfa_factors` — 0 linhas: nenhum usuário tem fator de MFA
  cadastrado hoje (não indica se MFA é exigido ou não como política).
- `auth.sso_providers`, `auth.sso_domains`, `auth.saml_providers` — 0
  linhas cada: SSO/SAML confirmado como não configurado.
- `auth.webauthn_credentials` — 0 linhas: nenhuma passkey cadastrada.

**Extensões PostgreSQL:** de mais de 80 extensões disponíveis no catálogo,
apenas 4 estão de fato instaladas — `plpgsql` (`pg_catalog`, padrão),
`pgcrypto` (`extensions`, padrão), `uuid-ossp` (`extensions`, padrão) e
`supabase_vault` (`vault`, instalada por padrão em todo projeto Supabase;
nenhuma referência a `vault.*` encontrada nas migrations ou no código —
uso real não confirmado). Confirmada a **ausência** das extensões que
ampliariam superfície de risco se combinadas com funções `SECURITY
DEFINER`: `pg_net`, `http`, `dblink`, `postgres_fdw`, `pg_cron` — nenhuma
instalada.

**Edge Functions:** `list_edge_functions` retornou lista vazia — **zero
Edge Functions implantadas**, confirmado diretamente pela API do Supabase
(não inferido pela ausência de referência no repositório).

**Realtime:** existe a publicação `supabase_realtime` (criada por padrão
em todo projeto Supabase, `puballtables = false`), mas `pg_publication_tables`
confirma **zero tabelas associadas** — nenhuma tabela do projeto está
configurada para broadcast via Realtime.

**Resultado: nenhuma nova vulnerabilidade confirmada.**

**Limitações registradas:** toda a configuração do serviço Auth
(confirmação de e-mail, sessão/JWT, política de senha além do
leaked-password já auditado, exigência de MFA, rate limits) permanece não
verificável com as ferramentas desta sessão — precisaria ser conferida
diretamente no painel (`Authentication → Sign In / Providers`,
`Authentication → Sessions`, `Authentication → Rate Limits`) ou via
Management API, nenhuma das quais está disponível aqui.

**Confirmação:** nenhuma alteração foi feita no Supabase, nenhum teste de
login, recuperação de senha, MFA ou endpoint real foi executado. Nenhuma
extensão, Edge Function, publicação ou configuração de Auth foi criada,
habilitada ou modificada.

**Referência:** relatório completo da Fase 1.11 está registrado na
conversa com a Ana — este documento resume o resultado técnico
verificável, não o substitui.

---

## Fase 1.12 — Resumo consolidado de prontidão de segurança

Esta seção consolida, numa única tabela, as pendências levantadas pelas
Fases 1.3 a 1.11 da auditoria de segurança do Supabase. Não substitui o
conteúdo técnico de cada fase (registrado acima e nos relatórios
completos na conversa) — organiza o que já foi encontrado para apoiar
decisão sobre prontidão para produção.

**Importante:** esta tabela não declara o projeto totalmente pronto para
produção. Há pendências relevantes sem resolução (ver seções 2 e 5
abaixo), algumas bloqueadas por permissão e outras por decisão que só a
proprietária do projeto pode tomar.

### 1. Correções realizadas e verificadas

| Item | Fase de origem | Estado atual | Ação necessária | Responsável |
|---|---|---|---|---|
| `templates_preview`: `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/`TRIGGER`/`REFERENCES` revogados de `anon`/`authenticated` | Fases 1.3–1.4 | Corrigido, verificado por leitura de `relacl` em múltiplas fases posteriores (1.8, 1.9) | Nenhuma | Concluído |
| `templates_preview`: privilégio `MAINTAIN` revogado de `anon`/`authenticated` | Fase 1.4 | Corrigido, verificado | Nenhuma | Concluído |
| Privilégios padrão (`ALTER DEFAULT PRIVILEGES`) para tabelas/views, funções e sequences futuras criadas por `postgres` em `public` | Fase 1.9 | Corrigido, verificado por leitura de `pg_default_acl` | Nenhuma | Concluído |

### 2. Riscos residuais confirmados

| Item | Fase de origem | Estado atual | Ação necessária | Responsável |
|---|---|---|---|---|
| Privilégios padrão de `supabase_admin` para tabelas/views, funções e sequences futuras em `public` continuam permissivos para `anon`/`authenticated` | Fase 1.9 | **Risco residual confirmado, bloqueado por permissão** — a conexão disponível (papel `postgres`) não tem autoridade para alterar privilégios padrão de `supabase_admin`. Não há exploração demonstrada; não há, até esta data, nenhuma migration do projeto que crie objetos como `supabase_admin` | Obter uma forma de executar como `supabase_admin` (credencial própria ou suporte da plataforma Supabase), ou aceitar formalmente o risco residual | Ana (decisão/acesso) — não executável por mim nesta sessão |

### 3. Riscos potenciais ou condicionais

| Item | Fase de origem | Estado atual | Ação necessária | Responsável |
|---|---|---|---|---|
| `GRANT arwd` de `anon`/`authenticated` em `storage.objects`/`storage.buckets` (baseline de plataforma, schema de propriedade de `supabase_storage_admin`) | Fase 1.10 | Inerte hoje — só se tornaria relevante se uma política RLS permissiva fosse criada em `storage.objects` sem revisão de escopo | Nenhuma ação obrigatória agora; revisar o `GRANT` caso uma política de Storage seja proposta no futuro | Eu, só se/quando uma política de Storage entrar em pauta |
| Ausência de `file_size_limit`/`allowed_mime_types` no bucket `template-assets` | Fase 1.10 | Sem risco de confidencialidade (acesso já integralmente controlado); ausência de hardening operacional | Opcional — configurar limites se desejado | Ana decide se quer |
| `EXECUTE` de `rls_auto_enable` não revisado (hoje só `postgres` tem acesso) | Fase 1.8 | Baixo risco; decisão registrada como pendente desde a migration `0002_policies.sql` | Decidir se revoga ou documenta formalmente a manutenção | Ana decide |
| Extensão `supabase_vault` instalada, sem uso confirmado no código ou nas migrations | Fase 1.11 | Observação de baixo risco, não uma vulnerabilidade | Nenhuma, a menos que um uso real seja identificado depois | — |

### 4. Limitações de visibilidade

| Item | Fase de origem | Estado atual | Ação necessária | Responsável |
|---|---|---|---|---|
| Configurações do serviço Auth — confirmação de e-mail, duração/expiração de sessão (JWT), política de comprimento/caracteres de senha, exigência de MFA, rate limits de login | Fase 1.11 | **Não verificável nesta sessão** — vive na Management API do Supabase, fora do alcance das ferramentas disponíveis. Ausência de verificação não é evidência de que algo esteja desabilitado ou mal configurado | Consulta manual no painel (`Authentication → Sign In / Providers`, `Sessions`, `Rate Limits`) ou disponibilizar uma ferramenta que leia a Management API | Ana, ou nova ferramenta numa sessão futura |
| Schemas expostos pela API do Supabase | Fase 1.9 | **Não verificável nesta sessão** — configuração de painel, não uma linha de catálogo do Postgres | Consulta manual no painel (`Settings → API`) | Ana |
| CDN/cache externo na frente das signed URLs do Storage (TTL de 60s) | Fase 1.10 | **Não verificável** via catálogos do Postgres | Nenhuma ação disponível com as ferramentas atuais | — |

### 5. Decisões que dependem da proprietária do projeto

| Item | Fase de origem | Estado atual | Ação necessária | Responsável |
|---|---|---|---|---|
| Leaked Password Protection desabilitado | Verificação inicial (anterior à numeração 1.x), reconfirmado na Fase 1.11 | **Melhoria de segurança pendente de decisão sobre plano/custo** — o recurso exige upgrade para o plano Pro, segundo a documentação oficial da Supabase | Decidir se faz upgrade de plano para habilitar | Ana |
| Privilégios padrão de `supabase_admin` (ver também item da seção 2) | Fase 1.9 | Bloqueado por permissão | Decidir entre buscar acesso administrativo ou aceitar o risco residual | Ana |
| `EXECUTE` de `rls_auto_enable` (ver também item da seção 3) | Fase 1.8 | Decisão pendente desde a migration `0002` | Decidir manter ou revogar | Ana |

---

**Confirmação desta etapa:** nenhuma operação foi realizada no Supabase.
Esta seção é só uma consolidação de leitura do que já estava registrado
nas Fases 1.3–1.11 — nenhum dado, permissão, política, função ou
configuração foi consultado novamente ou alterado.
