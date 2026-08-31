-- #1 (2026-08-31): patient type + optional second person.
-- Patients can be individual (default) | pareja | menor. For pareja/menor a
-- second person is stored in nombre_2/apellido_2. Person 1 (nombre/apellido)
-- stays the contact — for a minor that's the tutor/guardian (who holds the
-- phone/email). Composite display + search live in src/lib/format.js
-- (patientLabel / patientSearchText). Applied to prod via the Supabase
-- connector (migration `add_patient_type_and_second_person`).

ALTER TABLE patients ADD COLUMN IF NOT EXISTS tipo_paciente text NOT NULL DEFAULT 'individual';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS nombre_2 text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS apellido_2 text;

ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_tipo_paciente_check;
ALTER TABLE patients ADD CONSTRAINT patients_tipo_paciente_check
  CHECK (tipo_paciente IN ('individual', 'pareja', 'menor'));
