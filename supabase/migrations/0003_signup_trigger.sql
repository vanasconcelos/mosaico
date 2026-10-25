-- Mosaico — Fase 4.1 — 0003_signup_trigger.sql
-- Cria o perfil automaticamente quando um usuário é criado em auth.users.
-- Não altera nenhuma das 7 tabelas de negócio, nenhuma das 6 policies ou a
-- view templates_preview criadas em 0001/0002. Não toca rls_auto_enable(),
-- ensure_rls, catálogo ou has_paid_access.
--
-- A função roda como SECURITY DEFINER (dono: quem aplicar esta migration,
-- normalmente postgres) porque authenticated não tem nenhum privilégio de
-- escrita em profiles (REVOKE ALL da Fase 3, nunca restaurado) — só assim
-- o INSERT consegue acontecer. search_path fixado em 'public', sem incluir
-- nenhum schema onde anon/authenticated possam criar objeto (confirmado
-- na auditoria da Fase 3: CREATE é false pra ambos em todos os schemas
-- relevantes), evitando risco de shadowing.
--
-- ON CONFLICT (id) DO NOTHING: evita duplicata caso o evento dispare mais
-- de uma vez — apoiado na própria PK de profiles.id, que já impediria
-- duplicata com erro; aqui fica silencioso e idempotente de propósito.
--
-- Nenhuma exceção é capturada: se o INSERT falhar por qualquer motivo, o
-- erro se propaga e aborta a transação inteira do cadastro em auth.users
-- (decisão explícita — nunca deixar um usuário existir sem profile
-- correspondente).
--
-- EXECUTE é revogado de PUBLIC imediatamente após a criação da função —
-- sem isso, PUBLIC receberia EXECUTE por padrão (o mesmo ponto encontrado
-- na auditoria de rls_auto_enable, agora corrigido desde a criação).

begin;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

commit;
