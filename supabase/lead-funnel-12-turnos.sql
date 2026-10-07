-- #59 — Turnos coherentes + terapia familiar (2026-10-07). Additive only.
--   leads.turn_lock_at      — one bot turn per lead at a time (lead-reply-background).
--   leads.canned_enviados   — CANNED answers already sent in this conversation.
--   lead_inbox              — inbound free text/media waiting for the lead's next turn;
--                             messages within 4 s of each other are answered as ONE turn.
--   funnel_categorias 'terapia_familiar' — Carolina, Francisco (Nicolás, 7 Oct).

alter table public.leads add column if not exists turn_lock_at timestamptz;
alter table public.leads add column if not exists canned_enviados text[] not null default '{}';

create table if not exists public.lead_inbox (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  wamid text unique,
  msg jsonb not null,
  is_new boolean not null default false,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists lead_inbox_pending_idx on public.lead_inbox (lead_id, received_at) where processed_at is null;
alter table public.lead_inbox enable row level security;
drop policy if exists lead_inbox_owner on public.lead_inbox;
create policy lead_inbox_owner on public.lead_inbox for all using (is_owner()) with check (is_owner());

insert into public.funnel_categorias (clave, etiqueta, orden, terapeutas, activo)
select 'terapia_familiar', 'Terapia familiar', 11,
  array['48a4a020-8ab4-5e11-89ed-17a1e1713b54', '2f5bf11b-42a8-562f-99c9-501c62a4ca04']::uuid[], true
where not exists (select 1 from public.funnel_categorias where clave = 'terapia_familiar');
