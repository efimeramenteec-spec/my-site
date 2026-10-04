-- #16 — /facturar by WhatsApp approval (2026-10-04). ADDITIVE.
-- One row per list Nicolás asked for ("facturas" to the 9933). Aprobar emits ONLY
-- the session_ids frozen here; the estado flip pendiente→aprobada is the atomic
-- guard against double taps. Written only by Netlify functions (service_role).

create table if not exists factura_aprobaciones (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  origen      text not null default 'comando' check (origen in ('cron', 'comando')),
  session_ids uuid[] not null default '{}',
  total       numeric not null default 0,
  estado      text not null default 'pendiente'
              check (estado in ('pendiente', 'aprobada', 'descartada', 'vencida')),
  aprobada_at timestamptz,
  resultado   jsonb
);

create index if not exists factura_aprobaciones_pendiente_idx
  on factura_aprobaciones (created_at desc) where estado = 'pendiente';

alter table factura_aprobaciones enable row level security;
drop policy if exists factura_aprobaciones_owner on factura_aprobaciones;
create policy factura_aprobaciones_owner on factura_aprobaciones
  for all using (is_owner()) with check (is_owner());
grant select, insert, update, delete on factura_aprobaciones to authenticated, service_role;
