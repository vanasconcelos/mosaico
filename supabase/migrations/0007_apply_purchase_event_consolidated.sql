-- Mosaico — 0007_apply_purchase_event_consolidated.sql
-- Migration consolidada: cria, numa única transação, as três funções do
-- fluxo de compras (purchase_status_precedence, purchase_conflict_guard,
-- apply_purchase_event) — a última já com o corpo corrigido (advisory
-- lock transacional), sem jamais instalar, nem transitoriamente, a
-- versão com a condição de corrida conhecida.
--
-- APLICADA EM BANCO REMOTO (mosaico-sp / irfmkiikyquqjmasmzaj) — confirmado
-- por leitura direta do catálogo do Postgres em auditorias de segurança
-- posteriores a esta aplicação (owner, SECURITY DEFINER, search_path e
-- GRANTs das três funções batem exatamente com o corpo abaixo). Este
-- comentário originalmente afirmava o contrário ("não aplicada"); ficou
-- desatualizado depois da aplicação e foi corrigido nesta revisão
-- (Etapa 2.2A) sem alterar nenhuma linha de SQL executável do arquivo.
--
-- CONTEXTO (resumo; ver a auditoria completa desta sessão para o
-- histórico integral de investigação e testes):
--   * 0004_atomic_purchase_access.sql criou purchase_status_precedence,
--     purchase_conflict_guard e uma primeira versão de
--     apply_purchase_event. Essa primeira versão tem uma condição de
--     corrida real — reproduzida empiricamente em PostgreSQL
--     descartável: dois eventos diferentes do mesmo usuário, processados
--     concorrentemente, podiam deixar `profiles.has_paid_access` com um
--     valor obsoleto. Confirmado por auditoria read-only do projeto
--     remoto (mosaico-sp / irfmkiikyquqjmasmzaj) que 0004 NUNCA foi
--     aplicada lá. Permanece no repositório, intocada, só como registro
--     histórico — nunca deve ser aplicada como está.
--   * 0005_apply_purchase_event_profile_lock.sql tentou corrigir a
--     mesma corrida com `perform 1 from public.profiles ... for update`
--     depois do INSERT em purchases. Causou um deadlock real (SQLSTATE
--     40P01), reproduzido 2/2 vezes, entre 3+ chamadas concorrentes do
--     mesmo usuário disputando a mesma linha de profiles. NUNCA foi
--     aplicada remotamente. NUNCA deve ser aplicada.
--   * 0006_apply_purchase_event_advisory_lock.sql substituiu só
--     apply_purchase_event por uma versão com
--     `pg_advisory_xact_lock` por usuário, adquirido ANTES de qualquer
--     escrita — corrige a corrida original sem reproduzir o deadlock de
--     0005. Validada extensivamente (30+ repetições do cenário crítico,
--     rollback, idempotência, conflito de titularidade, colisão forçada
--     de chave, carga de até 30 sessões concorrentes) em ambiente
--     descartável e isolado. NUNCA foi aplicada remotamente.
--
-- POR QUE ESTA MIGRATION EXISTE, em vez de simplesmente aplicar 0004
-- seguida de 0006 como dois arquivos/transações separados: isso deixaria
-- uma janela real — entre o commit de 0004 e o commit de 0006 —  em que
-- apply_purchase_event estaria ao vivo e CHAMÁVEL com o corpo DA VERSÃO
-- COM CORRIDA. Esta migration cria diretamente a versão final (corpo de
-- 0006): a versão com corrida nunca chega a existir, nem
-- transitoriamente, em nenhum momento desta transação.
--
-- Hashes dos arquivos de referência usados para esta consolidação:
--   0004: 18518ebfd8c34477ed5f5fb95a0945fa5a6ba9e21cf14068fa40ca1152023805
--   0005: e75c31a78b065d00cb09015e433cf4a9a6ae3a6f050baa07696cf428a272bdf5
--   0006: 060e130f1932e19bfa5c394ce8c029f94ef687c836709493453a45e754dd5b13
--
-- O QUE NÃO MUDA, preservado integralmente em relação a 0004/0006:
--   * Assinatura de apply_purchase_event — os mesmos 6 parâmetros,
--     mesmos nomes e tipos. Nenhuma mudança é necessária no webhook
--     (src/app/api/webhooks/mercadopago/route.ts) nem na chamada
--     admin.rpc("apply_purchase_event", {...}).
--   * purchase_status_precedence e purchase_conflict_guard — corpo
--     idêntico ao de 0004, caractere a caractere (nenhuma linha
--     alterada).
--   * SECURITY DEFINER, search_path = public, REVOKE/GRANT restringindo
--     EXECUTE a service_role nas três funções — mesmo padrão de
--     0003/0004/0005/0006.
--   * O caminho ON CONFLICT em purchases e a lógica de desempate por
--     precedência de status — idênticos a 0004/0006.
--
-- GUARDA DE OWNERSHIP — dois contextos diferentes, não confundir: o
-- bloco `do $$ ... $$` abaixo roda NO MOMENTO EM QUE ESTA MIGRATION É
-- APLICADA, antes de qualquer função existir — current_user ali é o
-- papel que está aplicando a migration, sem nenhum efeito de
-- SECURITY DEFINER (a função ainda não existe). SECURITY DEFINER só
-- afeta current_user DEPOIS, durante chamadas reais de
-- apply_purchase_event já criada (current_user passa a ser o DONO da
-- função; session_user nunca muda, confirmado pela documentação
-- oficial do PostgreSQL 17, functions-info.html, Session Information
-- Functions). Reproduzida sem alterações em relação a 0004/0005/0006 —
-- nenhuma incompatibilidade encontrada que justificasse mudá-la.
--
-- LIMITAÇÃO EXPLÍCITA: os testes desta auditoria validaram a LÓGICA do
-- corpo abaixo (idêntica à de 0006, já exaustivamente testada). Este
-- arquivo específico, como texto consolidado, foi verificado por
-- comparação de blocos contra 0004/0006 e por um teste de sintaxe em
-- container descartável (criação das 3 funções + uma chamada de
-- smoke-test) — não por uma nova bateria de concorrência, que seria
-- redundante com a já documentada para 0006.

begin;

-- Guarda de ownership — idêntica à de 0004/0005/0006.
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

-- Função auxiliar pura (sem acesso a tabela, sem efeito colateral) —
-- corpo idêntico ao de 0004.
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

-- Guarda de conflito — corpo idêntico ao de 0004.
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

-- apply_purchase_event — corpo idêntico ao de 0006 (advisory lock antes
-- do INSERT). NUNCA o corpo original de 0004 (com a corrida). NUNCA o
-- de 0005 (FOR UPDATE, deadlock).
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
  -- Advisory lock transacional, exclusivo, por usuário, ANTES de
  -- qualquer escrita em purchases ou profiles — serializa, por usuário,
  -- qualquer recálculo concorrente de has_paid_access. Chave derivada
  -- diretamente dos bits do uuid do usuário (primeiro e último bloco de
  -- 32 bits do texto hexadecimal, sem hífens) — nenhuma função de hash
  -- (um hash introduziria um espaço de colisão artificial sobre um
  -- identificador já único por construção). Liberado automaticamente no
  -- COMMIT ou ROLLBACK da transação (_xact_, não a variante de sessão).
  perform pg_advisory_xact_lock(
    ('x' || substr(replace(p_user_id::text, '-', ''), 1, 8))::bit(32)::int,
    ('x' || substr(replace(p_user_id::text, '-', ''), 25, 8))::bit(32)::int
  );

  -- purchases/profiles sempre referenciadas qualificadas como
  -- public.purchases/public.profiles — nunca pelo nome nu (um nome
  -- totalmente qualificado nunca é afetado por search_path).
  insert into public.purchases (
    user_id, provider, provider_event_id, provider_event_at, status, amount_cents
  )
  values (
    p_user_id, p_provider, p_provider_event_id, p_provider_event_at, p_status, p_amount_cents
  )
  on conflict (provider, provider_event_id) do update
    -- `user_id = excluded.user_id` é um no-op nos únicos casos em que
    -- esta linha do SET chega a ser aplicada — purchase_conflict_guard
    -- (WHERE abaixo) já levantou exceção se o dono divergisse. Mantido
    -- explícito para deixar o invariante "titularidade nunca muda
    -- silenciosamente em conflito" visível no próprio SET.
    set user_id = excluded.user_id,
        status = excluded.status,
        amount_cents = excluded.amount_cents,
        provider_event_at = excluded.provider_event_at,
        updated_at = now()
    -- Guarda de ordenação + desempate por precedência de status + guarda
    -- de titularidade, todas dentro de purchase_conflict_guard — única
    -- expressão da cláusula WHERE, nunca um AND/OR de sub-expressões
    -- independentes (ordem de avaliação de sub-expressões booleanas não
    -- é garantida pelo Postgres).
    where public.purchase_conflict_guard(
      purchases.user_id, excluded.user_id,
      purchases.provider_event_at, excluded.provider_event_at,
      purchases.status, excluded.status
    );

  -- Recalculado só depois de o lock já estar adquirido e o evento acima
  -- já ter sido processado — nenhuma chamada concorrente do mesmo
  -- usuário pode estar escrevendo neste exato momento.
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

revoke execute on function public.purchase_status_precedence(text) from public;
grant execute on function public.purchase_status_precedence(text) to service_role;

revoke execute on function public.purchase_conflict_guard(
  uuid, uuid, timestamptz, timestamptz, text, text
) from public;

grant execute on function public.purchase_conflict_guard(
  uuid, uuid, timestamptz, timestamptz, text, text
) to service_role;

commit;
