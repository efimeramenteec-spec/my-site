-- #96 (29 Oct 2026): Efimeramente HQ WhatsApp desk. One row per owner order sent to an employee
-- ("Michael: ..." to the 9933). Written ONLY by the hq-desk background function (service_role).
-- Locked like a backup table (#90 rule): RLS on, no policies, REVOKE ALL from anon/authenticated;
-- the panel /hq page reads it through the owner-gated hq-status function.
create table if not exists public.hq_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agent text not null check (agent in ('michael','alex','vince','tim','wes')),
  texto text not null,
  estado text not null default 'nuevo' check (estado in ('nuevo','respondido','en_cola','hecho')),
  respuesta text,
  wamid text,                 -- inbound message id of the order (dedupe)
  reply_wamid text,           -- outbound reply id, once delivered
  outbox_id uuid,             -- owner_outbox row carrying the reply
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,5),
  model text,
  error text,
  updated_at timestamptz not null default now()
);
create unique index if not exists hq_orders_wamid_uq on public.hq_orders (wamid) where wamid is not null;
create index if not exists hq_orders_agent_created on public.hq_orders (agent, created_at desc);
alter table public.hq_orders enable row level security;
revoke all on table public.hq_orders from anon, authenticated;
grant select, insert, update, delete on table public.hq_orders to service_role;
