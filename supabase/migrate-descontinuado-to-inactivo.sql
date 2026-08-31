-- C2 (2026-08-31): collapse patient states to just activo | inactivo.
-- "descontinuado" was redundant / unclear vs "inactivo", so it's merged into
-- inactivo and dropped from the CHECK constraint. Supersedes the three-state
-- model from patient-estado-overhaul.sql (2026-07-04).
-- Applied to prod via the Supabase connector (migration
-- `migrate_descontinuado_to_inactivo`). Idempotent-safe to re-run.

UPDATE patients
  SET estado_general = 'inactivo', updated_at = now()
  WHERE estado_general = 'descontinuado';

ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_estado_general_check;
ALTER TABLE patients ADD CONSTRAINT patients_estado_general_check
  CHECK (estado_general IN ('activo', 'inactivo'));
