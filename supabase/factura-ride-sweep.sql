-- #47 — RIDE sweep bookkeeping (2026-10-05). ADDITIVE.
-- One row per invoiced session the 15-min sweep (netlify/lib/rideSweep.mjs) has
-- seen unsent. claimed_at = atomic send claim (never re-sent once claimed);
-- sri_alert_at = the single "sigue sin autorización del SRI" alert. Written only
-- by Netlify functions (service_role).

create table if not exists factura_ride_sweep (
  session_id    uuid primary key references sessions(id) on delete cascade,
  documento     text,
  first_seen_at timestamptz not null default now(),
  claimed_at    timestamptz,
  sent_at       timestamptz,
  sri_alert_at  timestamptz
);

alter table factura_ride_sweep enable row level security;
drop policy if exists factura_ride_sweep_owner on factura_ride_sweep;
create policy factura_ride_sweep_owner on factura_ride_sweep
  for all using (is_owner()) with check (is_owner());
grant select, insert, update, delete on factura_ride_sweep to authenticated, service_role;
