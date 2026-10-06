-- supabase/lead-funnel-11-modo-prueba.sql
-- #56 — Bot test mode from the owner phone. Nicolás types "modo prueba" to the
-- central number and, for 2h (renewed on every message), his own phone is
-- treated as a first-time lead. "reiniciar" deletes the test lead so the next
-- message is a first contact again; "fin prueba" turns it off.
--
--   bot_test_mode            — one row per owner phone (activo, expira_at). Owner-only RLS.
--   leads.es_prueba          — the test lead: no CAPI, no follow-ups, excluded from funnel counts.
--   lead_ai_decisions.es_prueba — its decisions stay as audit but are excluded from the panel.
-- Additive only.

create table if not exists public.bot_test_mode (
  owner_phone text primary key,
  activo      boolean not null default false,
  expira_at   timestamptz,
  updated_at  timestamptz not null default now()
);
alter table public.bot_test_mode enable row level security;
drop policy if exists bot_test_mode_owner on public.bot_test_mode;
create policy bot_test_mode_owner on public.bot_test_mode for all using (is_owner()) with check (is_owner());
grant all on public.bot_test_mode to service_role;

alter table public.leads add column if not exists es_prueba boolean not null default false;
alter table public.lead_ai_decisions add column if not exists es_prueba boolean not null default false;
