-- Mosaico — Fase 9 (correção) — 0004_atomic_purchase_access.sql
-- NÃO APLICADA EM BANCO REMOTO. Arquivo local, preparado só para revisão
-- (Etapa 4 da auditoria de consistência dos estados de pagamento).
--
-- Problema corrigido: o webhook (src/app/api/webhooks/mercadopago/route.ts)
-- fazia duas escritas SEPARADAS e não-atômicas — um `upsert` em `purchases`
-- seguido de um `update` em `profiles`, cada uma sua própria ida ao banco,
-- sem nenhuma coordenação entre notificações concorrentes para o MESMO
-- pagamento. Isso permitia dois problemas reais:
--   1) Duas notificações concorrentes pro mesmo `provider_event_id`
--      (ex.: uma reconsulta tardia da API devolvendo "approved", processada
--      DEPOIS de uma reconsulta mais recente já ter gravado "refunded") —
--      sem nenhum campo de ordenação, a escrita que terminasse por último
--      vencia, não a mais recente de verdade.
--   2) `has_paid_access` podia ficar fora de sincronia com `purchases` se o
--      processo falhasse entre as duas escritas (nenhuma das duas estava
--      dentro da mesma transação), e o código nem checava erro do `update`
--      de `profiles` — uma falha ali silenciosamente respondia 200 ao
--      Mercado Pago mesmo sem o acesso ter sido atualizado.
--
-- A própria coluna `purchases.provider_event_at`, desde a migration 0001,
-- já tinha o comentário "timestamp do PROVEDOR, nunca do recebimento" — a
-- intenção correta sempre existiu no schema; o bug era o código gravar
-- `new Date()` (hora de processamento do nosso servidor) em vez do
-- timestamp real do pagamento. Esta migration não cria coluna nova — só
-- adiciona a função que usa corretamente essa coluna já existente como
-- guarda de ordenação, e a chamada no código (fora desta migration) passa
-- a preencher `provider_event_at` com `date_last_updated` do próprio
-- pagamento (campo confirmado no tipo `PaymentResponse` da SDK já
-- instalada, node_modules/mercadopago/dist/clients/payment/commonTypes.d.ts)
-- em vez de `new Date()`.
--
-- CONFIRMADO na referência oficial da API (GET /v1/payments/{id},
-- developers.mercadopago.com.br, consultada na Etapa 5): `date_id` do
-- webhook é o ID do PRÓPRIO pagamento, reaproveitado em todas as
-- notificações daquele pagamento ao longo da vida dele (pending ->
-- approved -> refunded, por exemplo) — não um ID distinto por
-- notificação; e o corpo da notificação nunca inclui o status, por
-- desenho (reforça por que este código já reconsultava a API antes de
-- decidir, e por que isso continua sendo a defesa principal). A
-- documentação confirma que o Mercado Pago reenvia notificações não
-- confirmadas a cada 15 minutos (duplicatas são esperadas, não um caso
-- raro) e NÃO documenta garantia de ordem de entrega.
--
-- PENDENTE DE CONFIRMAÇÃO EXTERNA (ainda não resolvido, não presumido
-- como garantia): a referência oficial descreve `date_last_updated`
-- genericamente como "date on which the last payment event was
-- recorded", sem confirmar explicitamente que reembolsos e
-- contestações disparam essa atualização. Por isso o desempate abaixo
-- (Etapa 6) nunca trata o timestamp como prova de ordem real dos
-- acontecimentos quando ele empata — só evita que a ordem de
-- PROCESSAMENTO decida o resultado nesse caso.
--
-- DECISÃO DE NEGÓCIO (Etapa 6) — desempate de timestamp exatamente
-- igual: testado empiricamente contra Postgres real (Etapa 5) que, sem
-- nenhuma regra adicional, `excluded.provider_event_at >=
-- purchases.provider_event_at` deixa um empate exato decidido só pela
-- ordem de chegada — inaceitável quando isso permite 'paid' substituir
-- um estado que não concede acesso. A regra abaixo (função auxiliar
-- `purchase_status_precedence`) resolve empates por PRECEDÊNCIA do
-- status, nunca por ordem de chegada, com esta justificativa por
-- estado (menor número = vence o empate):
--   1 `disputed`  — contestação formal; o sinal mais sério e adversarial
--                   que existe aqui, trata-se como o mais "definitivo".
--   2 `refunded`  — dinheiro já devolvido ao comprador; tão definitivo
--                   quanto uma disputa, mas sem o caráter contencioso.
--   3 `refused`   — pagamento recusado; nunca concedeu acesso, mas é
--                   menos "final" que um reembolso (não houve dinheiro
--                   em trânsito).
--   4 `pending`   — estado intermediário, incerteza genuína sobre se o
--                   pagamento vai se completar — a regra de negócio diz
--                   explicitamente para nunca resolver ambiguidade a
--                   favor de conceder acesso.
--   5 `paid`      — o ÚNICO estado que concede acesso; por isso nunca
--                   pode vencer um empate contra qualquer outro —
--                   conceder acesso é a ação de maior risco/consequência
--                   aqui, então o desempate sempre pende contra ela.
-- Qualquer valor que não seja um desses 5 (não deveria ser possível —
-- `purchases.status` já tem `check (status in (...))` — mas defendido
-- aqui mesmo assim) recebe precedência 99, a pior de todas: nunca vence
-- um empate, nunca concede acesso por ambiguidade.
--
-- Design da função `apply_purchase_event`:
--   1) INSERT ... ON CONFLICT (provider, provider_event_id) DO UPDATE
--      com uma cláusula WHERE comparando `provider_event_at` — a sintaxe
--      "ON CONFLICT DO UPDATE ... WHERE" do Postgres é atômica e segura
--      sob concorrência: duas transações conflitando na mesma linha são
--      serializadas pelo próprio lock da constraint unique (uma espera a
--      outra confirmar antes de reavaliar a condição), nunca precisando de
--      lock explícito nem de uma segunda ida ao banco para checar.
--   2) Na mesma chamada de função (mesma transação implícita), recalcula
--      `has_paid_access` como `EXISTS` de qualquer compra com status
--      'paid' do usuário — nunca um valor imperativo fixado pelo status
--      desta chamada específica. Isso também resolve o caso de um usuário
--      ter mais de uma compra (o schema permite — `user_id` não é único em
--      `purchases`): o acesso reflete o estado agregado real, não o último
--      evento processado isoladamente.
--   3) `security definer` (Etapa 10 — ver bloco de comentários dedicado
--      abaixo; a Etapa 4 original usava `security invoker`, presumindo
--      sem comprovação que `service_role` já tinha os GRANTs de tabela
--      necessários). EXECUTE é revogado de PUBLIC/anon/authenticated
--      e concedido só a service_role, mesmo padrão de segurança explícito
--      já usado em 0003 para handle_new_user().
--
-- ============================================================
-- Etapa 10 — SECURITY DEFINER, não SECURITY INVOKER. Achado da auditoria
-- independente da Etapa 9 ("riscos relevantes", item R1): nenhuma
-- migration deste repositório concede a `service_role` nenhum privilégio
-- de tabela (INSERT/UPDATE/SELECT) em `purchases` ou `profiles` — só
-- `anon`/`authenticated` recebem `GRANT` em 0002_policies.sql, nunca
-- `service_role`. Com `security invoker` (como a função nasceu na Etapa
-- 4), toda instrução interna roda com os privilégios efetivos de quem
-- chama — ou seja, dependia inteiramente de uma convenção de PLATAFORMA
-- do Supabase (service_role com BYPASSRLS/GRANTs amplos por padrão),
-- nunca estabelecida por nenhum arquivo deste repositório e nunca
-- testada empiricamente antes da Etapa 9 (todo teste SQL anterior rodou
-- como superusuário Postgres, que ignora qualquer REVOKE/GRANT).
--
-- Testado na Etapa 10 (ver tests/sql/verify-apply-purchase-event.sql,
-- seção de privilégios): chamar esta função como um papel `service_role`
-- sintético, sem NENHUM GRANT de tabela, falha com "permission denied
-- for table purchases" sob `security invoker` — confirmando que a
-- premissa da Etapa 4 nunca foi garantida por este repositório.
--
-- Esta migration já resolveu o mesmo problema antes, para outro papel:
-- `0003_signup_trigger.sql` usa `security definer` porque `authenticated`
-- não tem GRANT de escrita em `profiles` (revogado na Fase 3) — a função
-- roda com os privilégios de quem a CRIOU (por convenção deste projeto,
-- o mesmo papel que aplica todas as migrations, dono das 7 tabelas desde
-- 0001), que por ownership já tem privilégio total nelas e É ISENTO DE
-- RLS (dono de tabela não está sujeito a RLS, a menos que `FORCE ROW
-- LEVEL SECURITY` esteja ativo — não está, confirmado em 0001). Esta
-- migration segue o MESMO padrão, já revisado neste repositório, em vez
-- de inventar um novo.
--
-- Por que não a alternativa (conceder GRANT de tabela direto a
-- service_role): (1) por si só NÃO resolveria RLS, que continuaria
-- bloqueando sem uma política específica — teria que ser combinado com
-- uma policy permissiva, não é uma solução de uma linha; (2) mesmo
-- combinado com uma policy, criaria um privilégio PERMANENTE e GERAL de
-- escrita em purchases/profiles para service_role, utilizável por
-- qualquer código futuro que use `admin.from(...)` em vez de
-- `admin.rpc("apply_purchase_event")` — destruindo a garantia estrutural
-- de que estas duas tabelas só são escritas através desta função
-- auditada (hoje reforçada só por convenção de código, ver o guard em
-- tests/webhook.test.mjs; com SECURITY DEFINER e nenhum GRANT de tabela
-- para service_role, essa garantia passa a ser también de BANCO: um
-- `admin.from("purchases").insert(...)` continuaria falhando com
-- "permission denied", mesmo no futuro).
--
-- Risco de SECURITY DEFINER mal-feito (o motivo de normalmente evitá-lo)
-- não se aplica aqui: a função nunca usa SQL dinâmico (`EXECUTE`/
-- `format()`), só parâmetros tipados ligados a instruções fixas;
-- `search_path = public` já fixado (mesmo padrão das outras 2 funções
-- desta migration); os únicos pontos de entrada são os 6 parâmetros
-- tipados, já defendidos por CHECK (status) e FOREIGN KEY (user_id) pré-
-- existentes — a função não pode ser levada a fazer nada fora do seu
-- contrato documentado (gravar um evento de compra e recalcular
-- has_paid_access de um único usuário).
--
-- PREMISSA RESIDUAL, não comprovada por este repositório (documentada
-- aqui em vez de presumida): que o papel que aplica esta migration no
-- projeto real é o mesmo papel, com os mesmos privilégios de dono, que
-- aplicou 0001-0003 — ou seja, o mesmo pipeline de migrations usado até
-- aqui. Não foi (e não podia ser, nesta etapa) verificado contra o
-- projeto Supabase real.
-- ============================================================
--
-- ============================================================
-- Etapa 8 — guarda de integridade de titularidade. Achado da revisão
-- independente da Etapa 7 ("riscos relevantes", item 2.1): a cláusula
-- `DO UPDATE SET` original (Etapa 4) nunca incluía `user_id` — então,
-- se uma chamada reutilizasse o mesmo (provider, provider_event_id) já
-- gravado, mas com um `p_user_id` diferente do dono já registrado, a
-- função atualizava status/valor/timestamp da compra em silêncio, sem
-- jamais mudar o dono gravado, e recalculava `has_paid_access` do
-- `p_user_id` da CHAMADA atual — não do dono real da linha. Uma
-- divergência real de integridade, mesmo não sendo, no fluxo atual do
-- webhook, uma rota de escalonamento de privilégio exercitável (o
-- `external_reference` de um pagamento não deveria mudar depois de
-- criado) — mas defendida aqui mesmo assim, explicitamente.
--
-- A correção NÃO faz uma consulta separada antes do `INSERT ... ON
-- CONFLICT` para comparar o dono já gravado — isso seria uma checagem
-- isolada (TOCTOU), insegura sob concorrência, exatamente o que esta
-- etapa foi instruída a não presumir como suficiente. Em vez disso, o
-- dono é comparado DENTRO da própria cláusula WHERE do `ON CONFLICT DO
-- UPDATE` — a mesma linha única que o Postgres já serializa pelo lock
-- da constraint `unique(provider, provider_event_id)` (a mesma garantia
-- de atomicidade documentada acima, usada desde a Etapa 4 para a
-- ordenação por timestamp). A função auxiliar `purchase_conflict_guard`
-- é a ÚNICA expressão da cláusula WHERE — nunca um operando entre
-- vários combinados com AND/OR — de propósito: a ordem de avaliação de
-- sub-expressões booleanas não é garantida pelo Postgres, então uma
-- checagem de dono que fosse só um dos lados de um AND/OR poderia, em
-- teoria, nunca ser avaliada se o planner resolvesse o outro lado
-- primeiro. Sendo a cláusula WHERE inteira, a única forma de decidir se
-- a atualização se aplica é avaliar essa função — nunca pode ser pulada.
--
-- Quando o dono diverge, a função LEVANTA EXCEÇÃO (nunca retorna
-- `false` silenciosamente) — isso aborta a transação da chamada inteira:
-- nem a tentativa de update em `purchases`, nem o recálculo de
-- `has_paid_access` em `profiles` chegam a ser persistidos (ambos
-- fazem parte da mesma transação implícita da função). A mensagem de
-- erro nunca inclui o `user_id` real, para nunca vazar identificador de
-- usuário em log (o webhook, fora desta migration, já só loga
-- `error.code`, nunca `error.message`).
-- ============================================================

begin;

-- ============================================================
-- Etapa 12 — guarda de ownership (achado R2 da Etapa 11: nenhuma
-- migration deste repositório garante que quem aplica 0004 é o mesmo
-- papel, dono das tabelas, que aplicou 0001 — só presumido). Em vez de
-- fixar um nome de papel (ex.: `ALTER FUNCTION ... OWNER TO postgres`),
-- o que exigiria presumir esse nome sem evidência (proibido
-- explicitamente nesta etapa), este bloco verifica a PROPRIEDADE que
-- realmente importa — se `current_user` (quem está aplicando esta
-- migration, seja ele qual for) já é o dono de `public.purchases` e
-- `public.profiles` — e ABORTA a migration inteira, antes de criar
-- qualquer função, se não for. Sem isso, `apply_purchase_event`
-- (SECURITY DEFINER) seria criada com sucesso mas falharia só em tempo
-- de execução, com "permission denied for table purchases" atribuído
-- ao dono da FUNÇÃO em vez de ao chamador — o mesmo sintoma da Etapa 9,
-- só que descoberto tarde e de forma mais confusa de diagnosticar. Esta
-- verificação transforma isso numa falha imediata, clara, no momento de
-- aplicar a migration.
do $$
declare
  v_purchases_owner oid := (select relowner from pg_class where oid = 'public.purchases'::regclass);
  v_profiles_owner oid := (select relowner from pg_class where oid = 'public.profiles'::regclass);
  v_current oid := current_user::regrole::oid;
begin
  if v_purchases_owner <> v_current or v_profiles_owner <> v_current then
    raise exception
      'apply_purchase_event (SECURITY DEFINER) exige que o papel que aplica esta migration (%) seja o DONO de public.purchases (dono atual: %) e public.profiles (dono atual: %). Abortando antes de criar qualquer função — sem esta checagem, a função seria criada com sucesso mas falharia só em tempo de execução.',
      current_user,
      (select relowner::regrole from pg_class where oid = 'public.purchases'::regclass),
      (select relowner::regrole from pg_class where oid = 'public.profiles'::regclass);
  end if;
end;
$$;
-- ============================================================

-- Função auxiliar pura (sem acesso a tabela, sem efeito colateral) —
-- só mapeia status para a precedência de desempate explicada acima.
-- `immutable`: mesma entrada sempre produz a mesma saída, nenhuma
-- dependência de estado externo — permite o planejador do Postgres
-- tratá-la com segurança dentro da cláusula WHERE de um ON CONFLICT.
create or replace function public.purchase_status_precedence(p_status text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_status
    when 'disputed' then 1
    when 'refunded' then 2
    when 'refused' then 3
    when 'pending' then 4
    when 'paid' then 5
    else 99
  end;
$$;

-- Guarda de conflito (Etapa 8): única expressão da cláusula WHERE do
-- `ON CONFLICT DO UPDATE` abaixo — ver justificativa de design no
-- bloco de comentários da Etapa 8, acima. Levanta exceção se a compra
-- já registrada pertence a outro usuário; caso contrário, reduz-se
-- exatamente à mesma guarda de ordenação/desempate das Etapas 4 e 6
-- (inalterada). `immutable`: mesma entrada sempre produz a mesma saída
-- (valor ou exceção), sem acesso a tabela nem estado externo.
create or replace function public.purchase_conflict_guard(
  p_existing_user_id uuid,
  p_new_user_id uuid,
  p_existing_at timestamptz,
  p_new_at timestamptz,
  p_existing_status text,
  p_new_status text
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_existing_user_id <> p_new_user_id then
    raise exception
      'apply_purchase_event: divergencia de titularidade para compra ja registrada — chamada abortada, nenhuma alteracao aplicada';
  end if;

  return p_new_at > p_existing_at
    or (
      p_new_at = p_existing_at
      and public.purchase_status_precedence(p_new_status)
          <= public.purchase_status_precedence(p_existing_status)
    );
end;
$$;

create or replace function public.apply_purchase_event(
  p_user_id uuid,
  p_provider text,
  p_provider_event_id text,
  p_provider_event_at timestamptz,
  p_status text,
  p_amount_cents int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_access boolean;
begin
  -- Etapa 12 (achado R1 da Etapa 11): `purchases`/`profiles`, abaixo e
  -- em todo o corpo desta função, são sempre referenciadas qualificadas
  -- como `public.purchases`/`public.profiles` — nunca pelo nome nu.
  -- Confirmado via documentação oficial do PostgreSQL que `set
  -- search_path = public` (sem `pg_temp` ao final) NÃO suprime a busca
  -- implícita no schema temporário da sessão atual, que continua sendo
  -- pesquisado PRIMEIRO por padrão — mas essa busca implícita só afeta
  -- relações (tabelas/views/sequences) e tipos, nunca nomes de função ou
  -- operador (por isso as chamadas a `public.purchase_conflict_guard`/
  -- `public.purchase_status_precedence`, já qualificadas desde a Etapa
  -- 8, nunca estiveram expostas a isso). Qualificar explicitamente é
  -- mais robusto que apenas acrescentar `, pg_temp` ao fim do
  -- search_path: um nome totalmente qualificado nunca é afetado por
  -- search_path, independente de qualquer configuração futura.
  insert into public.purchases (
    user_id, provider, provider_event_id, provider_event_at, status, amount_cents
  )
  values (
    p_user_id, p_provider, p_provider_event_id, p_provider_event_at, p_status, p_amount_cents
  )
  on conflict (provider, provider_event_id) do update
    -- `user_id = excluded.user_id` é um no-op nos únicos casos em que
    -- esta linha do SET chega a ser aplicada: `purchase_conflict_guard`
    -- (WHERE abaixo) já levantou exceção se o dono divergisse, então,
    -- por construção, `excluded.user_id = purchases.user_id` sempre que
    -- chegamos aqui. Mantido explícito (Etapa 8) para deixar o
    -- invariante "titularidade nunca muda silenciosamente em conflito"
    -- visível no próprio SET, não só implícito pela guarda.
    set user_id = excluded.user_id,
        status = excluded.status,
        amount_cents = excluded.amount_cents,
        provider_event_at = excluded.provider_event_at,
        updated_at = now()
    -- Guarda de ordenação (Etapa 4) + desempate por precedência de
    -- status (Etapa 6) + guarda de titularidade (Etapa 8), todas dentro
    -- de `purchase_conflict_guard` — ver justificativa de design no
    -- bloco de comentários da Etapa 8, acima, sobre por que esta
    -- cláusula WHERE é SEMPRE uma única chamada de função, nunca um
    -- AND/OR de sub-expressões independentes.
    where public.purchase_conflict_guard(
      purchases.user_id, excluded.user_id,
      purchases.provider_event_at, excluded.provider_event_at,
      purchases.status, excluded.status
    );

  select exists (
    select 1 from public.purchases
    where user_id = p_user_id and status = 'paid'
  ) into v_has_access;

  update public.profiles set has_paid_access = v_has_access where id = p_user_id;

  return v_has_access;
end;
$$;

revoke execute on function public.apply_purchase_event(
  uuid, text, text, timestamptz, text, int
) from public;

grant execute on function public.apply_purchase_event(
  uuid, text, text, timestamptz, text, int
) to service_role;

-- Mesmo padrão de segurança explícito para a função auxiliar — embora
-- seja pura e sem acesso a tabela, mantém a mesma disciplina de nunca
-- deixar PUBLIC com EXECUTE por padrão.
revoke execute on function public.purchase_status_precedence(text) from public;
grant execute on function public.purchase_status_precedence(text) to service_role;

-- Mesmo padrão de segurança explícito para a guarda de conflito (Etapa 8).
revoke execute on function public.purchase_conflict_guard(
  uuid, uuid, timestamptz, timestamptz, text, text
) from public;

grant execute on function public.purchase_conflict_guard(
  uuid, uuid, timestamptz, timestamptz, text, text
) to service_role;

commit;
