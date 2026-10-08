-- #66 — every lead-facing bot send, with its text and wamid, so it can be joined
-- to the receipts in whatsapp_delivery_status (which carry no text). Measurement
-- only; written best-effort by netlify/lib/botSendLog.mjs#logBotSend.
-- Applied via apply_migration `lead_bot_sends_66`.

create table if not exists public.lead_bot_sends (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid null references public.leads(id) on delete set null,
  phone text not null,
  wamid text null,
  kind text not null check (kind in ('text','question','cards','image','link','template','other')),
  body text null,
  template_name text null,
  error text null,
  es_prueba boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists lead_bot_sends_lead_created_idx on public.lead_bot_sends (lead_id, created_at);
create index if not exists lead_bot_sends_wamid_idx on public.lead_bot_sends (wamid);

alter table public.lead_bot_sends enable row level security;
drop policy if exists lead_bot_sends_owner on public.lead_bot_sends;
create policy lead_bot_sends_owner on public.lead_bot_sends
  for all using (is_owner()) with check (is_owner());

-- #62: this project does NOT auto-grant new tables.
grant select, insert, update, delete on table public.lead_bot_sends to service_role, authenticated;
