-- Mosaico — 0005_apply_purchase_event_profile_lock.sql
-- Corrige uma condição de corrida em apply_purchase_event (migration
-- 0004_atomic_purchase_access.sql), reproduzida empiricamente em ambiente
-- descartável e isolado (nunca contra banco remoto, nunca contra o
-- projeto mosaico-sp): dois eventos de provider_event_id DIFERENTES do
-- mesmo usuário, processados concorrentemente, podiam fazer
-- has_paid_access terminar com um valor obsoleto — o SELECT EXISTS que
-- calcula v_has_access tomava seu próprio snapshot (READ COMMITTED,
-- confirmado explicitamente no teste) antes de qualquer lock na linha de
-- profiles, então uma chamada podia decidir seu valor antes de ver o
-- resultado já comitado de outra chamada concorrente, e aplicar esse
-- valor obsoleto depois, sobrescrevendo um valor correto.
--
-- NÃO APLICADA EM BANCO REMOTO. 0004_atomic_purchase_access.sql permanece
-- INTOCADA — esta é uma migration NOVA, nunca uma edição retroativa de
-- uma migration já escrita (migrations são tratadas como imutáveis depois
-- de redigidas; mesmo já tendo sido confirmado, por consulta de catálogo
-- remoto, que 0004 nunca foi aplicada no projeto real, editar seu texto
-- histórico não seria a prática correta — se algum ambiente já a tivesse
-- aplicado com o texto antigo, editar o arquivo não atualizaria a função
-- já criada lá).
--
-- Única mudança funcional em relação a 0004: adquire um lock explícito
-- (`for update`) na linha de `profiles` do usuário, logo depois do
-- INSERT/ON CONFLICT em `purchases` e ANTES do SELECT EXISTS que calcula
-- v_has_access. Isso serializa, por usuário, qualquer recálculo
-- concorrente de has_paid_access: a chamada que tiver que esperar o lock
-- só calcula seu valor DEPOIS de a outra já ter comitado — nunca antes.
--
-- A linha de profiles sempre existe neste ponto da função, garantido
-- estruturalmente pela FK NOT NULL de purchases.user_id para profiles.id
-- (0001_schema.sql) — se não existisse, o INSERT em purchases (que vem
-- antes do novo lock) já teria falhado por violação de chave estrangeira,
-- confirmado por observação direta nesta etapa (Teste 4).
--
-- Testado empiricamente nesta etapa: Postgres 17.11 descartável, isolado,
-- sem porta publicada, mesma versão do projeto remoto. Reprodução do bug
-- confirmada com a função ORIGINAL (sem este lock, Teste 1); resultado
-- correto confirmado com esta variante, na mesma intercalação (Teste 1),
-- na ordem inversa (Teste 6), com reembolso concorrente (Teste 2), com
-- 3+ eventos concorrentes (Teste 3) e com usuário inexistente (Teste 4).
-- Ver relatório desta etapa para evidências completas.
--
-- Preserva integralmente, sem reescrever nem reorganizar: assinatura (6
-- parâmetros, mesmos nomes e tipos), SECURITY DEFINER, search_path =
-- public, guarda de ownership, lógica de precedência de status e guarda
-- de titularidade (purchase_conflict_guard/purchase_status_precedence,
-- inalteradas — não redeclaradas aqui por não terem mudado nenhuma
-- linha), REVOKE/GRANT de EXECUTE, retorno (boolean) e tratamento de
-- erros (nenhuma exceção é capturada dentro da função; a guarda de
-- titularidade continua levantando exceção exatamente como antes).

begin;

-- Mesma guarda de ownership de 0004 (Etapa 12) — current_user precisa
-- ser dono de public.purchases e public.profiles antes de substituir uma
-- função SECURITY DEFINER que as acessa. Reaplicada aqui porque esta é
-- uma migration independente, não uma continuação da transação de 0004.
do $$
declare
  v_purchases_owner oid := (select relowner from pg_class where oid = 'public.purchases'::regclass);
  v_profiles_owner oid := (select relowner from pg_class where oid = 'public.profiles'::regclass);
  v_current oid := current_user::regrole::oid;
begin
  if v_purchases_owner <> v_current or v_profiles_owner <> v_current then
    raise exception
      'apply_purchase_event (SECURITY DEFINER) exige que o papel que aplica esta migration (%) seja o DONO de public.purchases (dono atual: %) e public.profiles (dono atual: %). Abortando antes de substituir a função.',
      current_user,
      (select relowner::regrole from pg_class where oid = 'public.purchases'::regclass),
      (select relowner::regrole from pg_class where oid = 'public.profiles'::regclass);
  end if;
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

  -- ÚNICA linha funcional nova em relação a 0004 (ver cabeçalho deste
  -- arquivo e o relatório desta etapa para a análise e o teste empírico):
  -- adquire o lock de linha de profiles ANTES do cálculo de
  -- v_has_access, serializando qualquer recálculo concorrente do mesmo
  -- usuário. A linha sempre existe aqui — ver cabeçalho.
  perform 1 from public.profiles where id = p_user_id for update;

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

commit;
