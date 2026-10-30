-- #97 audit (29 Oct 2026): short context notes the HQ desk reads (it can't read Drive).
-- clave 'prioridades' = top of the scored backlog, refreshed by every /cierre. Locked like hq_orders:
-- RLS on, no policies, REVOKE ALL from anon/authenticated (service_role only).
create table if not exists public.hq_contexto (
  clave text primary key,
  texto text not null,
  actualizado_por text,
  updated_at timestamptz not null default now()
);
alter table public.hq_contexto enable row level security;
revoke all on table public.hq_contexto from anon, authenticated;
grant select, insert, update, delete on table public.hq_contexto to service_role;
