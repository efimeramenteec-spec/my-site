-- #60 (2026-10-07): invoicing hold + "concepto general". ADDITIVE.
-- facturacion_en_espera: the patient's paid sessions are listed in the Mon+Thu
--   facturas list as "En espera: {name} ({n} sesiones)" but NEVER emitted until
--   Nicolás lifts it (e.g. Mauro Baquero, waiting on his insurer's diagnosis).
-- factura_concepto_general: Observaciones = "Sesión Psicológica Individual | Sesión
--   {fecha}" — no patient name, no diagnosis (an adult paying through their own
--   insurance for another person). Billing still goes to the payer.
alter table public.patients add column if not exists facturacion_en_espera boolean not null default false;
alter table public.patients add column if not exists factura_concepto_general boolean not null default false;

-- factura_aprobaciones.origen gains 'chat': one-off emissions approved by Nicolás
-- in a Claude chat and run via /facturar emit-one (logged for the audit trail).
alter table public.factura_aprobaciones drop constraint if exists factura_aprobaciones_origen_check;
alter table public.factura_aprobaciones add constraint factura_aprobaciones_origen_check
  check (origen in ('cron', 'comando', 'chat'));
