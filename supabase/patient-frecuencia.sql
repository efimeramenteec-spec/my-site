-- Seguimiento module (2026-07-04): expected therapy cadence per patient.
-- Drives the historic attendance-rate metric — confirmed sessions vs the
-- number expected from the patient's frequency (semanal ≈ 4/month,
-- quincenal ≈ 2/month; see src/lib/adherence.js).
-- NULL = not defined yet; such patients are excluded from adherence math.
-- Applied via the Supabase connector as migration `patient_frecuencia`.

alter table patients
  add column if not exists frecuencia text
  check (frecuencia in ('semanal', 'quincenal'));
