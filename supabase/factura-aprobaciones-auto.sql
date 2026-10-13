-- #72 (2026-10-13): invoicing runs automatically Mon+Thu (Nicolás dropped the
-- approval step). facturar-report now emits by itself and logs each run in
-- factura_aprobaciones with origen 'auto', estado 'aprobada'. Additive.
alter table public.factura_aprobaciones drop constraint if exists factura_aprobaciones_origen_check;
alter table public.factura_aprobaciones add constraint factura_aprobaciones_origen_check
  check (origen in ('cron', 'comando', 'chat', 'auto'));
