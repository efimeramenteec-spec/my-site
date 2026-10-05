-- #53 (2026-10-05): reusable WhatsApp broadcasts (first use: Mariana's return).
-- A broadcast = one message to a filtered list of patients. Flow:
--   borrador → filtrando (therapist reviews the list, marks exclusions)
--   → listo (functions/broadcast-sweep.mjs sends, */15, 08:00–21:00 GYE)
--   → enviado (all recipients done; notifyOwner once with the failures).
-- Per recipient: open 24h window → free-form `body` with {{1}} = saludo;
-- closed → template `template_name` once Meta APPROVES it (any category).
-- claimed_at is the atomic send claim: a claimed row is never sent again,
-- even if the send failed (error is recorded instead). Owner-only RLS.

create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  terapeuta_id uuid references public.therapists(id) on delete set null,
  template_name text,
  body text not null,                 -- free-form copy, {{1}} = saludo
  estado text not null default 'borrador'
    check (estado in ('borrador', 'filtrando', 'listo', 'enviado')),
  notified_at timestamptz,            -- the one end-of-broadcast notifyOwner
  created_at timestamptz not null default now()
);

create table if not exists public.broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  orden int,                          -- number shown to the therapist in the review list
  telefono text not null,             -- E.164
  saludo text not null,
  etiqueta text,                      -- saludo + apellido, as shown in the review list
  excluido boolean not null default false,
  excluido_motivo text,
  canal text check (canal in ('free', 'template')),
  claimed_at timestamptz,
  wamid text,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (broadcast_id, patient_id),
  unique (broadcast_id, telefono)
);
create index if not exists idx_broadcast_recipients_pending
  on public.broadcast_recipients (broadcast_id) where claimed_at is null and not excluido;

alter table public.broadcasts enable row level security;
alter table public.broadcast_recipients enable row level security;
create policy broadcasts_owner on public.broadcasts for all using (is_owner()) with check (is_owner());
create policy broadcast_recipients_owner on public.broadcast_recipients for all using (is_owner()) with check (is_owner());

grant select, insert, update, delete on table public.broadcasts, public.broadcast_recipients to service_role;
grant select, insert, update, delete on table public.broadcasts, public.broadcast_recipients to authenticated;
