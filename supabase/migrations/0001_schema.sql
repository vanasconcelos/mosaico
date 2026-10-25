-- Mosaico — Fase 2 — 0001_schema.sql
-- Cria as 7 tabelas da arquitetura aprovada (Etapa B v6) e habilita RLS em
-- cada uma, sem nenhuma policy ainda (deny-all por padrão) — policies, a
-- view `templates_preview` e os GRANTs ficam para a Fase 3, de propósito.
--
-- NÃO CONTÉM: dados, credenciais, URLs reais do Canva, nem qualquer valor
-- de segredo. Nenhuma linha é inserida por este arquivo.
--
-- PRÉ-REQUISITOS AINDA PENDENTES, NÃO CONFIRMADOS (ver Plano de Execução
-- v7, seção 05) — nenhuma consulta foi feita ao banco para verificar isto:
--   * Versão do PostgreSQL do projeto São Paulo (irfmkiikyquqjmasmzaj).
--   * Disponibilidade de gen_random_uuid() nessa versão. É nativa desde o
--     Postgres 13, e projetos novos do Supabase hoje costumam provisionar
--     Postgres 17 por padrão — isso é um indício, não uma confirmação
--     deste projeto específico. Se a função não existir, a primeira
--     instrução que a usa falha e, por estar dentro da transação única
--     abaixo, nenhuma das 7 tabelas é criada.
--
-- TRANSAÇÃO ÚNICA, EXPLÍCITA — não depende do comportamento implícito do
-- SQL Editor nem da CLI (nenhum dos dois confirmou, em documentação
-- oficial, que agrupa múltiplas instruções numa transação automática).
-- Qualquer falha em qualquer instrução abaixo aborta o bloco inteiro:
-- nenhuma tabela fica parcialmente criada.
--
-- DELIBERADAMENTE SEM "IF NOT EXISTS": se qualquer uma das 7 tabelas já
-- existir, a instrução correspondente falha com erro ("relation already
-- exists"), abortando a transação. Isso é o comportamento desejado — a
-- existência prévia de uma tabela com esse nome não deve ser presumida
-- como "mesma estrutura, pode ignorar". A aplicação deve ser interrompida
-- e o estado investigado manualmente; este arquivo nunca apaga nem
-- sobrescreve nada para contornar esse caso.

begin;

-- 1) kits — base da hierarquia (packs e templates referenciam esta tabela)
create table kits (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique not null,      -- preserva o id atual ("kit-social-media"), só auditoria
  slug text unique not null,           -- identificador público real, usado em /kits/[slug]
  title text not null,
  description text not null,
  status text not null default 'draft', -- vestigial, sem efeito de produto hoje
  created_at timestamptz default now()
);
alter table kits enable row level security;

-- 2) packs — depende de kits; nasce vazia nesta migração (nenhum template
--    real tem packSlug preenchido hoje, confirmado por análise estática)
create table packs (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references kits (id),
  slug text not null,
  title text not null,
  "order" int,
  created_at timestamptz default now(),
  unique (kit_id, slug)
);
alter table packs enable row level security;

-- 3) templates — depende de kits e packs (pack_id é opcional)
create table templates (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique not null,      -- preserva o id atual, só auditoria
  kit_id uuid not null references kits (id),
  pack_id uuid references packs (id),  -- nullable — packs vazia hoje
  slug text unique not null,           -- identificador público real, usado em /templates/[slug]
  title text not null,
  description text,
  category text,                       -- Feed | Carrossel | Apresentação | Conteúdo Jurídico
  preview_image_url text,              -- público
  carousel_image_urls text[],
  original_canva_url text,             -- NUNCA lido pelo frontend, nem autenticado
  canva_editable_url text,             -- só liberado com has_paid_access = true (Fase 6)
  aspect_ratio text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (original_canva_url is distinct from canva_editable_url)
);
alter table templates enable row level security;

-- 4) tags — sem dependências
create table tags (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);
alter table tags enable row level security;

-- 5) template_tags — depende de templates e tags
create table template_tags (
  template_id uuid not null references templates (id),
  tag_id uuid not null references tags (id),
  primary key (template_id, tag_id)
);
alter table template_tags enable row level security;

-- 6) profiles — depende de auth.users (já existe, gerenciado pelo Supabase
--    Auth/GoTrue; este arquivo nunca cria nem altera o schema auth)
create table profiles (
  id uuid primary key references auth.users (id),
  email text not null,
  has_paid_access boolean not null default false, -- escrito só pelo webhook (service_role), Fase 8
  created_at timestamptz default now()
);
alter table profiles enable row level security;

-- 7) purchases — depende de profiles
create table purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id),
  provider text not null,                        -- 'stripe' | 'hotmart' | 'kiwify'
  provider_event_id text not null,
  provider_event_at timestamptz not null,         -- timestamp do PROVEDOR, nunca do recebimento
  status text not null
    check (status in ('pending', 'paid', 'refused', 'refunded', 'disputed')),
  amount_cents int,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (provider, provider_event_id)
);
alter table purchases enable row level security;

commit;

-- Fim de 0001_schema.sql. Nenhuma policy foi criada (Fase 3). Nenhum dado
-- foi inserido. Verificação pós-aplicação prevista (fora deste arquivo):
--   select relname, relrowsecurity
--   from pg_class
--   where relnamespace = 'public'::regnamespace
--     and relkind = 'r'
--     and relname in ('kits','packs','templates','tags','template_tags',
--                      'profiles','purchases');
-- Critério: relrowsecurity = true nas 7 linhas.
