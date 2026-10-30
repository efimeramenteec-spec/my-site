-- #93 (29 Oct 2026): carousel history + queue. One row per Instagram source link.
-- numero = POST-NN once it becomes a post; color_id = colors.mjs PAIRS id (nextPair reads
-- the publicado/en-curso rows in numero order). Owner-only (is_owner()).
create table if not exists public.carrusel_posts (
  id uuid primary key default gen_random_uuid(),
  numero int unique,                       -- 1 = POST-01; null for discarded links
  slug text,                               -- e.g. 'evitacion-experiencial'
  fuente_url text not null,                -- Instagram link Nicolás sent to the 9933
  fuente_msg_id uuid,                      -- whatsapp_messages row that carried the link
  estado text not null default 'en_cola'
    check (estado in ('en_cola','copia','corregido','renderizado','enviado','publicado','descartado')),
  color_id text,                           -- colors.mjs PAIRS id
  combo int,                               -- 1..8
  spec_path text,                          -- repo path of the spec json
  drive_folder text,                       -- IG · Listos/<folder>
  wamids text[],                           -- preview delivered to Nicolás
  publicado_at timestamptz,
  publicado_por text,                      -- 'nicolas_manual' | 'auto'
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.carrusel_posts enable row level security;
drop policy if exists carrusel_posts_owner on public.carrusel_posts;
create policy carrusel_posts_owner on public.carrusel_posts for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
grant select, insert, update, delete on table public.carrusel_posts to service_role, authenticated;
