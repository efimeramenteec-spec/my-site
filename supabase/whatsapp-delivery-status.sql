-- whatsapp_delivery_status — per-message delivery callbacks from Meta (Cloud API).
-- Meta pushes status events (sent → delivered → read, or failed) to the same
-- webhook as inbound messages (whatsapp-cloud-webhook.mjs). We used to discard
-- them; this table records them so we can tell, per reminder, whether it actually
-- DELIVERED to the patient vs was merely accepted by the API (a 200 ≠ delivery).
-- Added 2026-09-23 while diagnosing "reminders send but out-of-window patients
-- never get them" (suspected WhatsApp Coexistence template-delivery limitation).

create table if not exists whatsapp_delivery_status (
  id uuid primary key default gen_random_uuid(),
  wamid text not null,
  status text not null,              -- sent | delivered | read | failed
  recipient text,                    -- E.164 digits from Meta
  patient_id uuid references patients(id) on delete set null,
  error_code int,
  error_title text,
  error_message text,
  event_at timestamptz,              -- Meta's status timestamp
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (wamid, status)             -- one row per (message, status stage)
);
create index if not exists idx_wa_delivery_status_created on whatsapp_delivery_status(created_at desc);

alter table whatsapp_delivery_status enable row level security;
create policy wa_delivery_status_owner_read on whatsapp_delivery_status
  for select using (is_owner());
