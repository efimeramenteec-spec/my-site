-- #45 — Owner outbox (2026-10-05). ADDITIVE.
-- Any workflow that must reach Nicolás queues its WhatsApp message(s) here via
-- netlify/lib/ownerOutbox.mjs#notifyOwner. Window open → sent at once ('enviado');
-- window closed → 'pendiente' + one ping_nico template ping per closed window, and
-- his next inbound flushes every 'pendiente' row in order. Written only by Netlify
-- functions (service_role).

create table if not exists owner_outbox (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  kind         text not null,
  resumen      text,
  payload      jsonb not null,           -- { messages: [{type:'text',body} | {type:'buttons',body,buttons:[{id,title}]}] }
  estado       text not null default 'pendiente'
               check (estado in ('pendiente', 'enviado', 'fallido')),
  sent_at      timestamptz,
  ping_sent_at timestamptz,
  error        text
);

create index if not exists owner_outbox_pendiente_idx
  on owner_outbox (created_at) where estado = 'pendiente';

alter table owner_outbox enable row level security;
drop policy if exists owner_outbox_owner on owner_outbox;
create policy owner_outbox_owner on owner_outbox
  for all using (is_owner()) with check (is_owner());
grant select, insert, update, delete on owner_outbox to authenticated, service_role;
