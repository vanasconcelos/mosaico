-- Roteiro de verificação MANUAL da função apply_purchase_event
-- (supabase/migrations/0004_atomic_purchase_access.sql), atualizado na
-- Etapa 6 com o desempate por precedência de status, e na Etapa 8 com
-- a guarda de titularidade (cenários O1-O6 no final do arquivo).
--
-- NÃO é uma migration, NÃO deve ser aplicado em produção. Os testes JS
-- (tests/webhook.test.mjs) confirmam que a ROTA chama esta função com
-- os parâmetros certos — não que a função, em si, se comporta
-- corretamente sob concorrência ou empate de timestamp real. Isso só
-- um Postgres de verdade comprova.
--
-- Executado e confirmado na Etapa 6 (cenários 1-8) e na Etapa 8
-- (cenários O1-O6, incluindo concorrência real repetida 5 vezes com
-- papéis invertidos) contra um container Postgres 17 descartável
-- (imagem já presente localmente, nenhuma instalação nova, sem porta
-- exposta, sem conexão com o Supabase real). Reexecutar sempre que a
-- função mudar.
--
-- Pré-requisito pra rodar de novo: um Postgres de teste com as tabelas
-- profiles (simplificada: id uuid primary key, has_paid_access boolean)
-- e purchases (idêntica à migration 0001), DOIS usuários em profiles
-- (os cenários O1-O6 precisam de dois ids distintos — USER_ID e
-- OTHER_USER_ID abaixo), um role "service_role" (só pra o GRANT da
-- migration não falhar — num Postgres vanilla esse role não existe), e
-- o texto exato de 0004 aplicado.
--
-- EXECUTOR OBRIGATÓRIO (achado M3 da Etapa 17): este arquivo só funciona
-- corretamente via `psql -f <este arquivo> ...`, conectado como o papel
-- DONO das tabelas no ambiente descartável de teste (`app_owner` nos
-- exemplos abaixo) — nunca diretamente como `service_role`, nunca por
-- outro cliente SQL que não interprete meta-comandos do psql. O roteiro
-- alterna temporariamente para `service_role` internamente, via `SET
-- ROLE`/`RESET ROLE` (ver seção da Etapa 16, abaixo). `\set
-- ON_ERROR_STOP on` É um meta-comando específico do `psql` — outro
-- cliente (uma extensão de IDE, um driver genérico, etc.) pode
-- simplesmente ignorá-lo ou rejeitá-lo como sintaxe inválida, mudando o
-- comportamento de interrupção em caso de erro que este roteiro depende.
--
-- ============================================================
-- Etapa 16 — PROCEDIMENTO DE EXECUÇÃO (leia antes de rodar). Achado da
-- Etapa 15: rodar este arquivo inteiro como `service_role` numa única
-- sessão produz um resultado FALSO — a limpeza obrigatória (antes de
-- O1, abaixo) e todas as consultas de verificação de estado (SELECT
-- direto em purchases/profiles) exigem privilégio de tabela que
-- `service_role` nunca tem, por desenho (Etapa 10/12: só a função pode
-- escrever essas tabelas). Rodado como service_role, essa limpeza falha
-- com "permission denied" — e, sem `ON_ERROR_STOP`, o psql CONTINUA
-- silenciosamente pra o próximo cenário mesmo assim, deixando compras
-- residuais dos cenários 1-8 contaminarem os cenários O1-O6 (o cenário
-- O1, por exemplo, passa a retornar `t` em vez do `f` documentado).
--
-- A correção NÃO concede nenhum privilégio novo a `service_role` — ele
-- continua podendo só EXECUTAR as 3 funções, nunca ler/escrever as
-- tabelas direto. Em vez disso, o papel que RODA este arquivo
-- (`app_owner`, dono das tabelas — nunca `service_role` diretamente, e
-- nunca o superusuário) alterna explicitamente entre dois estados na
-- MESMA sessão, usando `SET ROLE`/`RESET ROLE`:
--   - `SET ROLE service_role` é o estado PADRÃO ao longo do arquivo —
--     restringe app_owner a exatamente os privilégios de service_role
--     (confirmado empiricamente na Etapa 16: um INSERT direto sob esse
--     estado falha com "permission denied", mesmo app_owner sendo dono
--     real da tabela — SET ROLE nunca soma privilégios, só restringe).
--     É o estado em que toda chamada a apply_purchase_event roda.
--   - `RESET ROLE` volta a app_owner (privilégio de dono) só nos
--     trechos de limpeza/verificação, marcados explicitamente com
--     "-- EXECUTAR COMO app_owner (dono)" — logo seguido de `SET ROLE
--     service_role` de novo, pra voltar ao estado padrão.
-- Pré-requisito adicional (além dos já listados acima): depois de criar
-- os papéis, conceder `grant service_role to app_owner;` — isso dá a
-- app_owner (que já domina service_role em privilégio, sendo dono das
-- tabelas) a capacidade de ASSUMIR a identidade de service_role via SET
-- ROLE; não concede nada NOVO a service_role.
-- ATENÇÃO (achado M4 da Etapa 17): esta concessão é EXCLUSIVA do
-- ambiente descartável de teste. NUNCA aplicar `grant service_role to
-- app_owner` (ou qualquer concessão de papel equivalente) contra o
-- Supabase real, e NUNCA incorporar isso a nenhuma migration de
-- produção — ela existe só para permitir que o papel dono simule
-- chamadas com os privilégios de `service_role` durante este roteiro
-- manual, localmente. `app_owner` não existe no Supabase real; esta
-- instrução é inofensiva se copiada fora deste contexto (falharia com
-- "role app_owner does not exist"), mas não deve ser tentada lá.
--
-- `\set ON_ERROR_STOP on` (abaixo) faz o psql abortar o script inteiro
-- no primeiro erro INESPERADO — incluindo uma limpeza ou verificação
-- que falhe. Os 3 pontos que DEVEM dar erro (cenário 7, e as segundas
-- chamadas de O2/O3) são blocos `DO` com `EXCEPTION WHEN` que capturam
-- especificamente o erro esperado (convertendo em NOTICE, não fatal) e
-- levantam uma exceção PRÓPRIA — que ainda interrompe o script via
-- ON_ERROR_STOP — se o erro esperado NÃO ocorrer, ou se ocorrer um erro
-- diferente do esperado.
-- ============================================================

\set ON_ERROR_STOP on

-- A partir daqui, o estado padrão da sessão é service_role — toda
-- chamada a apply_purchase_event roda sob exatamente os privilégios
-- reais que o webhook usa em produção (só EXECUTE, nenhum acesso de
-- tabela). Blocos de limpeza/verificação fazem RESET ROLE + SET ROLE
-- de volta, marcados explicitamente.
set role service_role;

-- === 1. paid seguido de refunded, timestamps diferentes ===
select apply_purchase_event('USER_ID'::uuid, 'mp', 'evt-1', '2026-01-01T10:00:00Z'::timestamptz, 'paid', 14790);
select apply_purchase_event('USER_ID'::uuid, 'mp', 'evt-1', '2026-01-02T10:00:00Z'::timestamptz, 'refunded', 14790);
-- esperado: status final 'refunded', has_paid_access = false.

-- === 2. refunded seguido de aprovação antiga (timestamp MENOR) ===
select apply_purchase_event('USER_ID'::uuid, 'mp', 'evt-2', '2026-01-02T10:00:00Z'::timestamptz, 'refunded', 14790);
select apply_purchase_event('USER_ID'::uuid, 'mp', 'evt-2', '2026-01-01T10:00:00Z'::timestamptz, 'paid', 14790);
-- esperado: a segunda chamada retorna false (bloqueada); status continua 'refunded'.

-- === 3. refunded e paid, timestamps EXATAMENTE IGUAIS, nas duas ordens ===
select apply_purchase_event('USER_ID'::uuid, 'mp', 'evt-3a', '2026-03-01T10:00:00Z'::timestamptz, 'refunded', 14790);
select apply_purchase_event('USER_ID'::uuid, 'mp', 'evt-3a', '2026-03-01T10:00:00Z'::timestamptz, 'paid', 14790);
-- esperado: status final 'refunded' (paid não vence o empate).

select apply_purchase_event('USER_ID'::uuid, 'mp', 'evt-3b', '2026-03-01T10:00:00Z'::timestamptz, 'paid', 14790);
select apply_purchase_event('USER_ID'::uuid, 'mp', 'evt-3b', '2026-03-01T10:00:00Z'::timestamptz, 'refunded', 14790);
-- esperado: status final TAMBÉM 'refunded' — mesmo resultado, ordem invertida (determinístico).

-- === 4. disputed e paid, timestamps iguais, nas duas ordens ===
select apply_purchase_event('USER_ID'::uuid, 'mp', 'evt-4a', '2026-04-01T10:00:00Z'::timestamptz, 'disputed', 14790);
select apply_purchase_event('USER_ID'::uuid, 'mp', 'evt-4a', '2026-04-01T10:00:00Z'::timestamptz, 'paid', 14790);
-- esperado: status final 'disputed'.

select apply_purchase_event('USER_ID'::uuid, 'mp', 'evt-4b', '2026-04-01T10:00:00Z'::timestamptz, 'paid', 14790);
select apply_purchase_event('USER_ID'::uuid, 'mp', 'evt-4b', '2026-04-01T10:00:00Z'::timestamptz, 'disputed', 14790);
-- esperado: status final TAMBÉM 'disputed', mesma ordem invertida.

-- === 5. dois eventos SIMULTÂNEOS de verdade (duas sessões/conexões reais,
-- não só duas chamadas sequenciais) pro mesmo provider_event_id, timestamp
-- empatado. Rodar em dois terminais ao mesmo tempo, AMBOS conectados
-- diretamente como service_role (psql -U service_role, não SET ROLE —
-- são conexões genuinamente separadas, como duas requisições concorrentes
-- reais seriam): ===
-- Sessão A: select apply_purchase_event('USER_ID'::uuid, 'mp', 'evt-5', '2026-05-01T10:00:00Z'::timestamptz, 'paid', 14790);
-- Sessão B: select apply_purchase_event('USER_ID'::uuid, 'mp', 'evt-5', '2026-05-01T10:00:00Z'::timestamptz, 'refunded', 14790);
-- esperado: status final 'refunded', independente de qual sessão commitou primeiro.
-- EXECUTAR COMO app_owner (dono) — consulta de verificação, nunca como service_role.
reset role;
select status from purchases where provider_event_id = 'evt-5';
set role service_role;

-- === 6. duas compras do mesmo usuário, uma reembolsada e outra válida ===
select apply_purchase_event('USER_ID'::uuid, 'mp', 'evt-6a', '2026-06-01T10:00:00Z'::timestamptz, 'refunded', 14790);
-- esperado aqui: has_paid_access = false (nenhuma das compras de USER_ID
-- até este ponto — evt-1 a evt-6a — tem status 'paid').
select apply_purchase_event('USER_ID'::uuid, 'mp', 'evt-6b', '2026-06-02T10:00:00Z'::timestamptz, 'paid', 14790);
-- esperado agora: has_paid_access = true (a segunda compra, independente, é válida).
-- EXECUTAR COMO app_owner (dono) — consulta de verificação, nunca como service_role.
reset role;
select has_paid_access from profiles where id = 'USER_ID'::uuid;
set role service_role;

-- === 7. estado desconhecido/inválido ===
-- Bloco DO: espera especificamente um check_violation (23514) da
-- constraint purchases_status_check. Se a chamada tiver sucesso, OU se
-- ocorrer um erro DIFERENTE do esperado, levanta exceção própria — que
-- interrompe o script via ON_ERROR_STOP (nunca aceita silenciosamente
-- um resultado diferente do documentado).
do $$
begin
  perform apply_purchase_event('USER_ID'::uuid, 'mp', 'evt-7', '2026-07-01T10:00:00Z'::timestamptz, 'estado_invalido_xyz', 14790);
  raise exception 'CENARIO 7 FALHOU: esperava erro de check constraint (status invalido), mas apply_purchase_event retornou sucesso';
exception
  when check_violation then
    if sqlerrm like '%purchases_status_check%' then
      raise notice 'CENARIO 7 OK: erro de check constraint (status invalido) confirmado, como esperado — nenhuma linha inserida, nenhum acesso concedido';
    else
      raise exception 'CENARIO 7 FALHOU: check_violation inesperado (nao e purchases_status_check): %', sqlerrm;
    end if;
end;
$$;

-- === 8. repetição do mesmo evento (idempotência) ===
select apply_purchase_event('USER_ID'::uuid, 'mp', 'evt-8', '2026-08-01T10:00:00Z'::timestamptz, 'paid', 14790);
select apply_purchase_event('USER_ID'::uuid, 'mp', 'evt-8', '2026-08-01T10:00:00Z'::timestamptz, 'paid', 14790);
-- esperado: ambas retornam true, status final 'paid', nenhuma duplicata
-- (constraint unique(provider, provider_event_id) garante isso).

-- === 9. CHECK constraint no caminho ON CONFLICT DO UPDATE, não só INSERT
-- (achado M2 da Etapa 17 — o cenário 7 só exercita o CHECK pelo caminho
-- de INSERT, nunca pelo de atualização de uma linha já existente) ===
-- 1) compra nova, válida:
select apply_purchase_event('USER_ID'::uuid, 'mp', 'check-upd-1', '2026-10-01T10:00:00Z'::timestamptz, 'paid', 14790);
-- esperado: t (linha nova, válida).
-- 2) MESMO provider_event_id (nunca um novo — precisa ser a mesma linha,
-- pra forçar o caminho ON CONFLICT DO UPDATE), timestamp ESTRITAMENTE
-- MAIS NOVO (garante que purchase_conflict_guard libere a atualização
-- independente do status — se o timestamp fosse igual/mais antigo, ou
-- perdesse a precedência, o UPDATE nunca chegaria a ser tentado, e o
-- CHECK nunca seria exercitado por este caminho), status inválido:
do $$
begin
  perform apply_purchase_event('USER_ID'::uuid, 'mp', 'check-upd-1', '2026-10-02T10:00:00Z'::timestamptz, 'estado_invalido_xyz', 14790);
  raise exception 'CENARIO 9 FALHOU: esperava erro de check constraint no caminho ON CONFLICT DO UPDATE, mas apply_purchase_event retornou sucesso'
    using errcode = 'TEST1';
exception
  when check_violation then
    if sqlerrm like '%purchases_status_check%' then
      raise notice 'CENARIO 9 OK: erro de check constraint confirmado no caminho ON CONFLICT DO UPDATE (nao so INSERT), como esperado';
    else
      raise exception 'CENARIO 9 FALHOU: check_violation inesperado (nao e purchases_status_check): %', sqlerrm;
    end if;
end;
$$;
-- EXECUTAR COMO app_owner (dono) — consultas de verificação: confirma
-- que a tentativa inválida não alterou o registro existente nem afetou
-- o acesso, de nenhuma forma.
reset role;
select user_id, status from purchases where provider_event_id = 'check-upd-1';
-- esperado: user_id = USER_ID (inalterado), status AINDA 'paid' — a
-- tentativa de UPDATE inválida nunca chegou a persistir (CHECK
-- constraint reverte a transação inteira da chamada que falhou).
select has_paid_access from profiles where id = 'USER_ID'::uuid;
-- esperado: true (evt-6b/evt-8, já 'paid' desde o cenário 8, continuam
-- válidas — a tentativa inválida em check-upd-1 não concedeu nem
-- removeu acesso).
delete from purchases where provider_event_id = 'check-upd-1';
set role service_role;

-- === Limpeza (só no banco de teste) ===
-- EXECUTAR COMO app_owner (dono) — se descomentar, trocar para esse
-- papel primeiro (reset role;), nunca rodar como service_role.
-- delete from purchases where provider_event_id like 'evt-%';
-- update profiles set has_paid_access = false where id = 'USER_ID'::uuid;

-- ============================================================
-- Etapa 8 — guarda de titularidade (achado 2.1 da Etapa 7). Precisa de
-- um SEGUNDO usuário já cadastrado em profiles, diferente de USER_ID.
-- Substitua OTHER_USER_ID por esse segundo id antes de rodar, do mesmo
-- jeito que USER_ID é substituído hoje.
--
-- Limpeza OBRIGATÓRIA antes de O1: os cenários 1-8 acima usam o MESMO
-- USER_ID e deixam compras 'paid' (evt-6b, evt-8) associadas a ele —
-- sem limpar, USER_ID já chegaria aos cenários abaixo com
-- has_paid_access = true por causa dessas compras alheias, tornando os
-- comentários "esperado" de O1 incorretos (não por falha da função —
-- o recálculo agregado de has_paid_access está correto — mas porque os
-- cenários deixariam de estar isolados um do outro). Esta limpeza
-- EXIGE privilégio de dono (DELETE/UPDATE direto) — por isso o RESET
-- ROLE abaixo: sob `service_role`, ela falharia com "permission
-- denied", e (achado da Etapa 15) o psql, sem ON_ERROR_STOP, seguiria
-- adiante mesmo assim, contaminando O1-O6 com o estado de 1-8.
-- EXECUTAR COMO app_owner (dono).
reset role;
delete from purchases where provider_event_id like 'evt-%';
update profiles set has_paid_access = false where id = 'USER_ID'::uuid;
set role service_role;

-- === O1. mesma compra, mesmo proprietário (regressão: deve continuar igual à Etapa 6) ===
select apply_purchase_event('USER_ID'::uuid, 'mp', 'own-1', '2026-09-01T10:00:00Z'::timestamptz, 'paid', 14790);
select apply_purchase_event('USER_ID'::uuid, 'mp', 'own-1', '2026-09-02T10:00:00Z'::timestamptz, 'refunded', 14790);
-- esperado: t, depois f — igual à Etapa 6, dono nunca muda, nenhum erro.
-- EXECUTAR COMO app_owner (dono) — consulta de verificação.
reset role;
select user_id, status from purchases where provider_event_id = 'own-1';
set role service_role;
-- esperado: user_id = USER_ID, status = 'refunded'.

-- === O2. mesma compra, proprietário DIVERGENTE, timestamp mais NOVO (que ganharia se não fosse a guarda) ===
select apply_purchase_event('USER_ID'::uuid, 'mp', 'own-2', '2026-09-01T10:00:00Z'::timestamptz, 'paid', 14790);
-- esperado: t (compra nova, válida, do dono correto).
-- Bloco DO: espera especificamente a exceção de divergência de
-- titularidade (purchase_conflict_guard, SQLSTATE padrão P0001 — nome
-- de condição "raise_exception"). Verifica também o TEXTO da mensagem,
-- pra não aceitar silenciosamente um outro erro P0001 não relacionado.
-- Achado M1 da Etapa 17: a exceção PRÓPRIA abaixo (disparada só quando
-- a chamada tem sucesso ao contrário do esperado) usa `using errcode =
-- 'TEST1'` — um código que nunca corresponde a 'raise_exception'
-- (P0001) — para NUNCA ser recapturada pelo `exception when
-- raise_exception` abaixo como se fosse a própria exceção da função
-- testada (o que produziria uma mensagem redundante/confusa).
do $$
begin
  perform apply_purchase_event('OTHER_USER_ID'::uuid, 'mp', 'own-2', '2026-09-02T10:00:00Z'::timestamptz, 'refunded', 14790);
  raise exception 'CENARIO O2 FALHOU: esperava erro de divergencia de titularidade (timestamp mais novo NAO deveria bastar pra passar), mas apply_purchase_event retornou sucesso'
    using errcode = 'TEST1';
exception
  when raise_exception then
    if sqlerrm like 'apply_purchase_event: divergencia de titularidade%' then
      raise notice 'CENARIO O2 OK: divergencia de titularidade bloqueada mesmo com timestamp mais novo, como esperado';
    else
      raise exception 'CENARIO O2 FALHOU: erro inesperado (nao e a divergencia de titularidade esperada): %', sqlerrm;
    end if;
end;
$$;
-- EXECUTAR COMO app_owner (dono) — consultas de verificação.
reset role;
select user_id, status from purchases where provider_event_id = 'own-2';
-- esperado: user_id AINDA = USER_ID, status AINDA = 'paid' (nada mudou).
select has_paid_access from profiles where id = 'USER_ID'::uuid;
-- esperado: true (dono original manteve o acesso).
select has_paid_access from profiles where id = 'OTHER_USER_ID'::uuid;
-- esperado: false (a chamada abortada não pôde conceder nada a ele).
set role service_role;

-- === O3. mesma compra, proprietário divergente, timestamp mais ANTIGO (perderia por recência mesmo
-- sem a guarda — confirma que a guarda dispara independente do resultado da checagem de recência) ===
select apply_purchase_event('USER_ID'::uuid, 'mp', 'own-3', '2026-09-05T10:00:00Z'::timestamptz, 'paid', 14790);
-- esperado: t (compra nova, válida, do dono correto).
-- Achado M1 da Etapa 17: mesmo cuidado de O2 — `using errcode = 'TEST1'`
-- evita que a exceção própria de "sucesso inesperado" seja recapturada
-- pelo handler abaixo.
do $$
begin
  perform apply_purchase_event('OTHER_USER_ID'::uuid, 'mp', 'own-3', '2026-09-01T10:00:00Z'::timestamptz, 'paid', 14790);
  raise exception 'CENARIO O3 FALHOU: esperava erro de divergencia de titularidade (nunca deveria ser ignorado silenciosamente como "evento atrasado"), mas apply_purchase_event retornou sucesso'
    using errcode = 'TEST1';
exception
  when raise_exception then
    if sqlerrm like 'apply_purchase_event: divergencia de titularidade%' then
      raise notice 'CENARIO O3 OK: divergencia de titularidade bloqueada independente do timestamp, como esperado';
    else
      raise exception 'CENARIO O3 FALHOU: erro inesperado (nao e a divergencia de titularidade esperada): %', sqlerrm;
    end if;
end;
$$;
-- EXECUTAR COMO app_owner (dono) — consulta de verificação.
reset role;
select user_id, status from purchases where provider_event_id = 'own-3';
-- esperado: user_id = USER_ID, status = 'paid' (inalterado).
set role service_role;

-- === O4. rollback completo: uma chamada abortada por divergência não deixa NENHUM rastro ===
-- EXECUTAR COMO app_owner (dono) — consulta de verificação.
reset role;
select count(*) from purchases where provider_event_id in ('own-2', 'own-3');
-- esperado: 2 (uma linha por evento, nunca uma segunda linha criada pela tentativa divergente).
set role service_role;

-- === O5. concorrência real: duas sessões de verdade disputando o MESMO provider_event_id, com
-- proprietários DIFERENTES e timestamp empatado. Rodar em dois terminais ao mesmo tempo, AMBOS
-- conectados diretamente como service_role (repetir com os papéis trocados pra não depender de
-- qual sessão "ganha" a corrida — o que importa é que SEMPRE exatamente uma falha explicitamente,
-- nunca as duas aplicam, nunca fica ambíguo): ===
-- Sessão A: select apply_purchase_event('USER_ID'::uuid, 'mp', 'own-5', '2026-09-10T10:00:00Z'::timestamptz, 'paid', 14790);
-- Sessão B: select apply_purchase_event('OTHER_USER_ID'::uuid, 'mp', 'own-5', '2026-09-10T10:00:00Z'::timestamptz, 'refunded', 14790);
-- esperado: uma das duas sessões retorna normalmente (a que conseguiu inserir primeiro), a outra
-- recebe ERRO de divergência de titularidade — nunca as duas sessões retornam sucesso, nunca a
-- linha final fica com um dono diferente do que realmente a inseriu.
-- EXECUTAR COMO app_owner (dono) — consulta de verificação.
reset role;
select user_id, status from purchases where provider_event_id = 'own-5';
-- esperado (só reflete algo depois de rodar as duas sessões acima manualmente): uma única linha,
-- dono = quem quer que tenha vencido a corrida de inserção.
set role service_role;

-- === O6. acesso preservado por outra compra válida, mesmo após uma tentativa de divergência em outro evento ===
-- EXECUTAR COMO app_owner (dono) — consulta de verificação.
reset role;
select has_paid_access from profiles where id = 'USER_ID'::uuid;
-- esperado: true (continua tendo own-2 e own-3 'paid', nenhum deles foi revertido pelas tentativas divergentes).

-- Fim do roteiro — sessão devolvida ao estado de dono (app_owner), sem
-- SET ROLE pendente.

-- === Limpeza (só no banco de teste) ===
-- EXECUTAR COMO app_owner (dono) — já é o papel ativo neste ponto.
-- delete from purchases where provider_event_id like 'own-%';
-- update profiles set has_paid_access = false where id in ('USER_ID'::uuid, 'OTHER_USER_ID'::uuid);

-- ============================================================
-- Etapa 12 — R1 (referências de schema qualificadas) e R2 (guarda de
-- ownership), achados da auditoria independente da Etapa 11.
--
-- R1: confirmado via documentação oficial do PostgreSQL que `set
-- search_path = public` (sem `pg_temp` ao final) não suprime a busca
-- implícita no schema temporário da sessão, que continua sendo
-- pesquisado primeiro por padrão — mas isso só afeta relações
-- (tabelas/views/sequences) e tipos, nunca função/operador. As 3
-- referências de tabela não qualificadas em apply_purchase_event
-- (`insert into purchases`, `from purchases`, `update profiles`) agora
-- são `public.purchases`/`public.profiles` explicitamente — nenhum
-- cenário de teste novo necessário além de reconfirmar os cenários
-- 1-8/O1-O6 acima, que continuam idênticos (qualificar não muda
-- comportamento, só elimina a ambiguidade de resolução).
--
-- R2: 0004 agora tem um bloco DO logo após o `begin;` que verifica se
-- `current_user` (quem aplica a migration) é dono de `public.purchases`
-- e `public.profiles`, abortando com erro claro ANTES de criar qualquer
-- função se não for — sem presumir nenhum nome de papel.
--
-- Como reproduzir os 3 cenários de ownership da Etapa 12 (além dos
-- passos de privilégio já descritos na seção da Etapa 10, acima):
--   1) MESMO papel não superusuário aplica 0001 e depois 0004: o bloco
--      DO passa silenciosamente, a migration conclui normalmente, o
--      papel é dono de tabelas E funções. Confirmar com:
--        select relname, relowner::regrole from pg_class
--          where relname in ('purchases','profiles');
--        select proname, proowner::regrole from pg_proc
--          where proname in ('apply_purchase_event','purchase_conflict_guard','purchase_status_precedence');
--      — devem bater com o papel que aplicou tudo.
--   2) Papel A aplica 0001 (dono das tabelas); papel B DIFERENTE, não
--      superusuário, com CREATE em public mas SEM GRANT nas tabelas de
--      A, tenta aplicar 0004: esperado ERRO explícito do bloco DO
--      ("exige que o papel que aplica esta migration (b) seja o DONO
--      de public.purchases..."), toda a migration em ROLLBACK — zero
--      função criada (confirmar com a mesma consulta a pg_proc acima,
--      0 rows). Sem o bloco DO, isso teria o efeito oposto: a migration
--      aplicaria com SUCESSO (nenhum erro visível), e só mais tarde,
--      quando service_role de fato chamasse a função, apareceria
--      "permission denied for table purchases" — o MESMO sintoma da
--      Etapa 9, agora atribuído ao dono da função em vez de ao
--      chamador, e por isso mais confuso de diagnosticar. Confirmado
--      empiricamente na Etapa 12 criando manualmente uma função análoga
--      sem o bloco DO (dono = papel B) e chamando-a como service_role.
--   3) Depois do cenário 1 (migration aplicada com sucesso), reexecutar
--      os cenários 1-8 e O1-O6 (acima neste arquivo) como `service_role`
--      (nunca como superusuário nem como o papel dono) — confirmado
--      idêntico ao documentado em cada cenário. Em particular: ordenação
--      temporal (cenários 1-2), precedência em empate (cenários 3-4) e
--      acesso após múltiplas compras (cenário 6) — não há cenários
--      rotulados "T1"/"P1"/"M1" separados neste arquivo; esses conceitos
--      já são cobertos pelos cenários acima.
-- ============================================================

-- ============================================================
-- Etapa 16 — correção do procedimento de execução (achado da Etapa 15:
-- rodar o arquivo inteiro como service_role produzia um falso resultado
-- em O1, por falta de privilégio na limpeza obrigatória). Ver o bloco
-- de comentários dedicado no topo deste arquivo. Resumo da correção:
--   - `\set ON_ERROR_STOP on`: qualquer erro inesperado interrompe o
--     script, nunca é silenciosamente ignorado.
--   - `SET ROLE service_role` como estado padrão; `RESET ROLE` só nos
--     trechos de limpeza/verificação, marcados explicitamente — exige
--     `grant service_role to app_owner;` no setup (não concede nada
--     novo a service_role, só permite o dono impersoná-lo).
--   - Cenário 7 e as segundas chamadas de O2/O3 (que esperam erro) são
--     blocos DO com EXCEPTION WHEN específico, que falham explicitamente
--     se o erro esperado não ocorrer ou se ocorrer um erro diferente.
-- Testado na Etapa 16 em Postgres 17 descartável, confirmando: a
-- limpeza/verificação agora roda com sucesso como app_owner; as
-- chamadas continuam funcionando como service_role; os cenários de
-- titularidade (O1-O4) e concorrência real (via processos psql
-- separados, ambos como service_role) continuam cobertos e corretos.
-- ============================================================

-- ============================================================
-- Etapa 18 — correções finais apontadas pela auditoria independente da
-- Etapa 17 (M1-M4):
--   - M1: os blocos DO de O2/O3 agora usam `using errcode = 'TEST1'` na
--     exceção própria de "sucesso inesperado", pra nunca ser recapturada
--     pelo mesmo `exception when raise_exception` que escuta o erro
--     real da função (ambos geravam SQLSTATE P0001 por padrão antes
--     desta correção, causando uma mensagem de diagnóstico redundante
--     no caminho de falha — nunca um resultado aceito indevidamente como
--     sucesso, mas uma mensagem confusa). Nenhuma verificação de
--     SQLSTATE nem de mensagem foi removida ou enfraquecida.
--   - M2: novo cenário 9, exercitando o CHECK constraint de
--     purchases.status pelo caminho ON CONFLICT DO UPDATE (o cenário 7
--     só testava o caminho INSERT) — usa o mesmo provider_event_id nas
--     duas chamadas, com timestamp estritamente mais novo na segunda
--     (garante que purchase_conflict_guard libere a tentativa de
--     atualização independente do status, senão o UPDATE nunca seria
--     tentado e o CHECK nunca disparar-se-ia por este caminho).
--   - M3: declarado explicitamente, no topo do arquivo, que a execução
--     exige `psql -f`, conectado como o papel dono — `\set
--     ON_ERROR_STOP` é um meta-comando específico do psql.
--   - M4: aviso isolado junto à instrução `grant service_role to
--     app_owner`, explicitando que é exclusiva do ambiente descartável
--     de teste.
-- Nenhuma migration foi alterada. Nenhum privilégio novo foi concedido
-- a service_role. Testado na Etapa 18 em Postgres 17 descartável — ver
-- relatório da etapa para os resultados.
-- ============================================================

-- ============================================================
-- Etapa 19 — cenários de concorrência real para
-- 0006_apply_purchase_event_advisory_lock.sql (advisory lock por
-- usuário, substitui a tentativa de 0005 que deadlockava). Diferente
-- dos cenários acima (sequenciais, uma única sessão), estes exigem
-- DUAS OU TRÊS sessões `psql` REAIS, em terminais separados — mesma
-- convenção já usada nos cenários 5/O5, ambos conectados diretamente
-- como `service_role`.
--
-- Já executados e confirmados, com evidência completa (pg_locks,
-- pg_stat_activity, pg_blocking_pids, xids reais), em ambiente Postgres
-- 17 descartável, nas etapas de investigação desta auditoria — ver os
-- relatórios dessas etapas para o grafo de espera e os resultados
-- detalhados. Documentado aqui só para permitir reexecução manual
-- sempre que a função mudar, no mesmo espírito dos cenários 5/O5.
--
-- Pré-requisito OBRIGATÓRIO (achado de revisão independente: um usuário
-- "novo" e um usuário "reaproveitado dos cenários 1-9/O1-O6 acima" NÃO
-- são equivalentes — não trate como opções intercambiáveis): os
-- cenários 1-9/O1-O6 deixam compras residuais associadas ao USER_ID
-- usado ali (ex. own-2, own-3 continuam 'paid') — reaproveitar esse
-- mesmo USER_ID sem limpar faria has_paid_access já vir `true` ANTES de
-- C10 começar, por causa do resíduo, não da lógica de concorrência
-- sendo testada aqui. Escolha UMA das duas opções abaixo, nunca pule
-- esta etapa:
--   (a) RECOMENDADO — use um USER_ID novo, nunca usado em nenhum
--       cenário anterior deste arquivo. Elimina o problema por
--       construção; ou
--   (b) se for reaproveitar o USER_ID dos cenários 1-9/O1-O6, rode
--       PRIMEIRO a mesma limpeza obrigatória já exigida antes de O1
--       (acima, "delete from purchases where provider_event_id like
--       'evt-%'; update profiles set has_paid_access = false where id
--       = 'USER_ID'::uuid;") e CONFIRME com
--       `select has_paid_access from profiles where id =
--       'USER_ID'::uuid;` que o resultado é `false` antes de continuar.

-- === C10. corrida original: evento `paid` mantido aberto, depois
-- evento `pending` DIFERENTE do mesmo usuário, concorrente ===
-- Sessão A: begin; select apply_purchase_event('USER_ID'::uuid, 'mp', 'c10-paid', '2026-11-20T10:00:00Z'::timestamptz, 'paid', 14790);
--   -- NÃO comitar ainda.
-- Sessão B: begin; select apply_purchase_event('USER_ID'::uuid, 'mp', 'c10-pending', '2026-11-20T10:05:00Z'::timestamptz, 'pending', null);
--   -- deve bloquear (pg_blocking_pids da Sessão B deve apontar pra Sessão A;
--   -- wait_event_type='Lock', wait_event='advisory').
-- Sessão A: commit;
-- esperado: Sessão B destrava e retorna t; has_paid_access final = true
-- (existe uma compra paid válida, confirmado mesmo com o pending concorrente).

-- === C11. ordem inversa: `pending` primeiro, `paid` depois ===
-- Sessão A: begin; select apply_purchase_event('USER_ID'::uuid, 'mp', 'c11-pending', '2026-11-21T10:00:00Z'::timestamptz, 'pending', null);
--   -- NÃO comitar ainda.
-- Sessão B: begin; select apply_purchase_event('USER_ID'::uuid, 'mp', 'c11-paid', '2026-11-21T10:05:00Z'::timestamptz, 'paid', 14790);
--   -- deve bloquear.
-- Sessão A: commit;
-- esperado: Sessão B destrava e retorna t; has_paid_access final = true.

-- === C12. três sessões: `paid` → `pending` → `paid`, mesmo usuário ===
-- Sessão A: begin; select apply_purchase_event('USER_ID'::uuid, 'mp', 'c12-a-paid', '2026-11-22T10:00:00Z'::timestamptz, 'paid', 14790);
--   -- NÃO comitar ainda.
-- Sessão B: begin; select apply_purchase_event('USER_ID'::uuid, 'mp', 'c12-b-pending', '2026-11-22T10:05:00Z'::timestamptz, 'pending', null);
--   -- deve bloquear.
-- Sessão C: begin; select apply_purchase_event('USER_ID'::uuid, 'mp', 'c12-c-paid', '2026-11-22T10:10:00Z'::timestamptz, 'paid', 9900);
--   -- deve bloquear.
-- Sessão A: commit;
-- Sessão B e Sessão C: cada uma deve ser comitada quando ela própria
-- destravar — a fila do advisory lock decide a ordem entre B e C, não
-- quem está operando o terminal; não há escolha livre aqui.
-- esperado: nenhum erro (SQLSTATE 40P01 nem 40001); has_paid_access final
-- = true; purchases com as 3 linhas corretas (2 paid, 1 pending).
--
-- Testado 30 vezes consecutivas (90 chamadas) nas etapas de investigação
-- desta auditoria, com usuários isolados por repetição: 30/30 sem erro,
-- resultado final correto em todas.
--
-- === Limpeza (só no banco de teste) ===
-- EXECUTAR COMO app_owner (dono) — se descomentar, trocar para esse
-- papel primeiro (reset role;), nunca rodar como service_role.
-- delete from purchases where provider_event_id like 'c1%';
-- update profiles set has_paid_access = false where id = 'USER_ID'::uuid;
--
-- Não testado neste arquivo (nem nas etapas de investigação): PgBouncer
-- em modo transaction pooling; volume de produção real. Ausência de
-- falha nos testes acima não é garantia de ausência de falha em
-- produção.
-- ============================================================
