-- #52 — Daily "sesión en Pendiente" reminders to therapists (2026-10-05). ADDITIVE.
-- One row per reminder sent for a past session still in estado 'programada'
-- (netlify/functions/sesiones-pendientes.mjs, daily 08:30 GYE). The therapist's
-- [Ocurrió]/[No ocurrió] tap (whatsapp-cloud-webhook → lib/sesionesPendientes.mjs)
-- stamps respuesta + respondida_at on every open row of that session.
-- escalated_at marks the row on which the 3-days-unanswered notifyOwner went out
-- (once per session). Written only by Netlify functions (service_role).

create table if not exists session_estado_reminders (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions(id) on delete cascade,
  terapeuta_id  uuid references therapists(id) on delete set null,
  sent_at       timestamptz not null default now(),
  canal         text not null check (canal in ('free', 'template', 'push')),
  wamid         text,
  respuesta     text check (respuesta in ('ocurrio', 'no_ocurrio')),
  respondida_at timestamptz,
  escalated_at  timestamptz
);

create index if not exists session_estado_reminders_session_idx
  on session_estado_reminders (session_id, sent_at);

alter table session_estado_reminders enable row level security;
drop policy if exists session_estado_reminders_owner on session_estado_reminders;
create policy session_estado_reminders_owner on session_estado_reminders
  for all using (is_owner()) with check (is_owner());
grant select, insert, update, delete on session_estado_reminders to authenticated, service_role;
