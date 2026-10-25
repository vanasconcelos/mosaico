-- Mosaico — Fase 3 — 0002_policies.sql
-- Sobre as 7 tabelas já criadas (0001_schema.sql, RLS habilitada, zero
-- policy), corrige privilégios efetivos, cria a view pública segura
-- `templates_preview` e as policies de leitura pública/isolamento por
-- usuário. Não cria nem altera nenhuma função, trigger ou extensão.
--
-- NÃO CONTÉM: revogação de EXECUTE em public.rls_auto_enable() — essa é
-- uma decisão separada, não incluída aqui por instrução explícita.
--
-- Revoga TODOS os privilégios (não só insert/update/delete) de
-- `anon`/`authenticated` nas 7 tabelas, porque uma consulta de leitura
-- confirmou que ambos tinham INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/
-- TRIGGER concedidos por padrão — TRUNCATE em particular não é protegido
-- por RLS, por isso precisa ser revogado explicitamente aqui.
--
-- `templates` (tabela base) não recebe nenhum GRANT SELECT nem nenhuma
-- policy para anon/authenticated — fica inteiramente bloqueada; só a
-- view abaixo expõe um subconjunto seguro de colunas.
--
-- A view roda com os privilégios do dono (padrão do Postgres, sem
-- security_invoker) de propósito: o dono (postgres) ignora RLS em
-- `templates` e consegue ler todas as linhas para re-expor só as
-- colunas seguras; com security_invoker=true, o chamador (anon/
-- authenticated) precisaria de privilégio direto em `templates`, que
-- acabamos de revogar — a view deixaria de funcionar. A proteção real
-- aqui não depende de RLS ser avaliada para a view: depende só da lista
-- de colunas da própria definição nunca incluir legacy_id,
-- original_canva_url ou canva_editable_url.
--
-- Nenhuma policy de UPDATE é criada em `profiles` — o UPDATE geral já
-- fica revogado pelo `revoke all` acima, protegendo has_paid_access;
-- uma policy de update seria sem efeito prático e poderia sugerir,
-- enganosamente, que existe um caminho de escrita que na verdade não
-- existe.
--
-- A trigger de cadastro (auth.users -> profiles) fica para a Fase 4,
-- junto da implementação da autenticação — não é criada aqui.

begin;

revoke all on kits, packs, templates, tags, template_tags, profiles, purchases
from anon, authenticated;

grant select on kits, packs, tags, template_tags to anon, authenticated;
grant select on profiles, purchases to authenticated;

create view templates_preview as
select id, kit_id, pack_id, slug, title, description, category,
       preview_image_url, carousel_image_urls, aspect_ratio
from templates;

grant select on templates_preview to anon, authenticated;

create policy kits_select_all on kits for select using (true);
create policy packs_select_all on packs for select using (true);
create policy tags_select_all on tags for select using (true);
create policy template_tags_select_all on template_tags for select using (true);

create policy profiles_select_own on profiles
  for select using (auth.uid() = id);

create policy purchases_select_own on purchases
  for select using (auth.uid() = user_id);

commit;
