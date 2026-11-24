-- Mosaico — 0006_apply_purchase_event_advisory_lock.sql
-- Corrige, pela via validada, a condição de corrida em apply_purchase_event
-- (migration 0004_atomic_purchase_access.sql): dois eventos de
-- provider_event_id DIFERENTES do mesmo usuário, processados
-- concorrentemente, podiam fazer has_paid_access terminar com um valor
-- obsoleto, porque o SELECT EXISTS que calcula v_has_access tomava seu
-- próprio snapshot (READ COMMITTED) antes de qualquer serialização por
-- usuário.
--
-- HISTÓRICO — por que esta migration existe em vez de editar 0004 ou 0005:
--   * 0005_apply_purchase_event_profile_lock.sql tentou corrigir o mesmo
--     problema com `perform 1 from public.profiles where id = p_user_id
--     for update;` DEPOIS da escrita em purchases. Essa variante
--     reproduziu, de forma determinística e repetida (2/2 execuções
--     idênticas), um deadlock real (SQLSTATE 40P01) quando 3 ou mais
--     chamadas concorrentes do MESMO usuário disputavam a MESMA linha de
--     profiles: ao liberar a transação bloqueadora, os esperadores
--     restantes podiam formar um ciclo de espera ENTRE SI (evidência
--     completa, grafo de espera e xids reais, registrados nas etapas de
--     investigação desta auditoria). 0005 permanece no repositório,
--     INTOCADA, como registro histórico do que foi tentado e por que foi
--     descartado — nunca deve ser aplicada como solução.
--   * Migrations são tratadas como imutáveis depois de escritas. Esta
--     migration NUNCA edita 0004 nem 0005 — ela substitui a função via
--     `create or replace function`, com a MESMA assinatura, o que é
--     suficiente para que o Postgres passe a usar este corpo novo,
--     independente da ordem em que 0004/0005/0006 tenham sido aplicadas
--     anteriormente (0006 sempre vence, por ser a última a rodar).
--
-- SOLUÇÃO — advisory lock transacional por usuário, adquirido ANTES de
-- qualquer escrita (ao contrário de 0005, que bloqueava DEPOIS):
--   * `pg_advisory_xact_lock(key1 int, key2 int)` com a chave derivada
--     DIRETAMENTE dos bits do próprio uuid do usuário (primeiro e último
--     bloco de 32 bits do texto hexadecimal, sem hífens) — nenhuma função
--     de hash. Um hash (hashtext/md5) introduziria um espaço de colisão
--     artificial sobre um identificador que já é único por construção
--     (gen_random_uuid(), UUID v4, ~122 bits de entropia real — ver
--     0001_schema.sql). Extrair bits nativos do uuid não adiciona esse
--     espaço de colisão extra.
--   * Determinístico: o mesmo uuid sempre produz a mesma chave (dois
--     inteiros de 32 bits) — confirmado empiricamente via `pg_locks`
--     (mesmo par classid/objid para duas chamadas do mesmo usuário) nas
--     etapas de teste desta auditoria.
--   * Chaves de usuários DIFERENTES são, na prática, DIFERENTES — o lock
--     nunca serializa um usuário contra outro. Testado também o caso de
--     colisão FORÇADA entre dois uuids distintos (mesmos blocos extremos
--     de 32 bits, meio diferente): o único efeito observado foi
--     serialização adicional (espera) — nunca mistura de dados nem
--     alteração de titularidade, já que a query que recalcula
--     has_paid_access sempre filtra pelo user_id real, nunca pela chave
--     do lock.
--   * Transacional (`_xact_`, não `pg_advisory_lock` de sessão): liberado
--     automaticamente no COMMIT **ou** no ROLLBACK da transação —
--     confirmado na documentação oficial do PostgreSQL 17
--     (postgresql.org/docs/17/explicit-locking.html: "Transaction-level
--     lock requests... are automatically released at the end of the
--     transaction, and there is no explicit unlock operation") e
--     testado empiricamente (uma chamada que falha por violação de CHECK
--     constraint, DEPOIS de já ter adquirido o lock, libera-o
--     corretamente — a chamada seguinte do mesmo usuário nunca trava).
--
-- O QUE NÃO MUDA, preservado integralmente:
--   * Assinatura de apply_purchase_event — os mesmos 6 parâmetros, mesmos
--     nomes e tipos. Nenhuma mudança é necessária no webhook
--     (src/app/api/webhooks/mercadopago/route.ts) nem na chamada
--     admin.rpc("apply_purchase_event", {...}).
--   * purchase_status_precedence e purchase_conflict_guard — não
--     redeclaradas aqui, porque não têm nenhuma linha alterada. A
--     guarda de titularidade continua levantando exceção sempre que
--     `p_existing_user_id <> p_new_user_id`, ANTES de qualquer avaliação
--     de precedência de status — testado exaustivamente (2 e 3 usuários
--     disputando o mesmo evento, nas duas ordens de chegada, com todos
--     os pares de status) nas etapas de investigação desta auditoria:
--     titularidade nunca é transferida silenciosamente.
--   * SECURITY DEFINER, search_path = public, REVOKE/GRANT restringindo
--     EXECUTE a service_role — idênticos ao padrão de 0003/0004/0005.
--   * O caminho ON CONFLICT em purchases e a lógica de desempate por
--     precedência de status — inalterados.
--
-- LIMITAÇÃO EXPLÍCITA, não escondida: os testes desta auditoria (30
-- repetições do cenário crítico de 3 vias, testes de rollback,
-- idempotência, conflito de titularidade, carga de até 30 sessões
-- concorrentes, e uma investigação direta de deadlock entre advisory
-- locks puros) foram feitos inteiramente em PostgreSQL 17 descartável e
-- isolado — são evidências de testes finitos, não uma garantia
-- matemática de ausência de falhas em produção. Não testado: PgBouncer
-- em modo transaction pooling; volume de produção real.

begin;

-- Mesma guarda de ownership de 0004/0005 (Etapa 12) — current_user
-- precisa ser dono de public.purchases e public.profiles antes de
-- substituir uma função SECURITY DEFINER que as acessa.
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
  -- ÚNICA diferença funcional em relação a 0004 (ver cabeçalho deste
  -- arquivo para a análise completa e a referência aos testes): adquire
  -- um advisory lock transacional, exclusivo, por usuário, ANTES de
  -- qualquer escrita em purchases ou profiles. Isso serializa, por
  -- usuário, qualquer recálculo concorrente de has_paid_access — a
  -- chamada que tiver que esperar o lock só calcula seu valor DEPOIS de
  -- a outra já ter comitado (ou revertido) — nunca antes.
  perform pg_advisory_xact_lock(
    ('x' || substr(replace(p_user_id::text, '-', ''), 1, 8))::bit(32)::int,
    ('x' || substr(replace(p_user_id::text, '-', ''), 25, 8))::bit(32)::int
  );

  -- Etapa 12 (achado R1 da Etapa 11, 0004): `purchases`/`profiles`,
  -- abaixo e em todo o corpo desta função, são sempre referenciadas
  -- qualificadas como `public.purchases`/`public.profiles` — nunca pelo
  -- nome nu. Confirmado via documentação oficial do PostgreSQL que `set
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
    -- bloco de comentários da Etapa 8, em 0004, sobre por que esta
    -- cláusula WHERE é SEMPRE uma única chamada de função, nunca um
    -- AND/OR de sub-expressões independentes.
    where public.purchase_conflict_guard(
      purchases.user_id, excluded.user_id,
      purchases.provider_event_at, excluded.provider_event_at,
      purchases.status, excluded.status
    );

  -- Recalcula has_paid_access só depois de ter o lock e de ter
  -- processado o evento acima — nunca antes. Como o lock já está
  -- adquirido, nenhuma chamada concorrente do mesmo usuário pode estar
  -- escrevendo neste exato momento: este SELECT sempre vê o estado mais
  -- atual já comitado por qualquer chamada anterior do mesmo usuário.
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
