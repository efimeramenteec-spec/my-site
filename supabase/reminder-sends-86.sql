-- #86 C (22 Oct 2026): failed reminders must not count as sent.
-- One row per reminder WhatsApp accepted by Dualhook (payment 'pago' or appointment
-- 'cita'), keyed by the wamid Meta returned, so a later async 'failed' status in
-- whatsapp_delivery_status can be traced back to the sessions it stamped:
--   → the stamp (recordatorio_pago_at / reminder_sent_at) is cleared,
--   → failed_at/error recorded, ONE notifyOwner (kind 'recordatorio_fallido').
-- A session+phone pair that already failed is not retried until the number changes.
create table if not exists public.reminder_sends (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('pago', 'cita')),
  wamid text unique,
  patient_id uuid references public.patients(id) on delete set null,
  session_ids uuid[] not null default '{}',
  telefono text,
  sent_at timestamptz not null default now(),
  failed_at timestamptz,
  error text,
  owner_notified_at timestamptz
);
create index if not exists reminder_sends_unreconciled_idx on public.reminder_sends (sent_at) where failed_at is null;
create index if not exists reminder_sends_failed_phone_idx on public.reminder_sends (telefono) where failed_at is not null;

alter table public.reminder_sends enable row level security;
drop policy if exists reminder_sends_owner on public.reminder_sends;
create policy reminder_sends_owner on public.reminder_sends for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

grant select, insert, update, delete on table public.reminder_sends to service_role, authenticated;
