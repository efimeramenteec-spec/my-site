-- Manual-invoicing exemption for the /facturar protocol (2026-07-13).
-- Applied via the Supabase connector (migration `add_patient_facturacion_manual`).
--
-- Patients with facturacion_manual = true are NEVER auto-invoiced by /facturar.
-- They need a special insurance-format factura that Nicolas issues by hand.
-- The /facturar eligibility query MUST include:
--     AND coalesce(p.facturacion_manual, false) = false
--
-- Currently flagged (insurance-format cases): Sharian Narvaez, Raguel Conforme Vasquez,
-- Emilie Conforme, Laura Vasquez.
alter table public.patients
  add column if not exists facturacion_manual boolean not null default false;
