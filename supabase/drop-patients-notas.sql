-- C1 (2026-08-31): remove the patient free-text "Expediente" (patients.notas)
-- for good — no clinical/personal notes stored in the app while security isn't
-- guaranteed. The field was already removed from the UI + data layer; this drops
-- it from the DB. The 10 existing entries were backed up out-of-band first.
-- Applied to prod via the Supabase connector (migration `drop_patients_notas`).
-- NOTE: session-level `sessions.notas` (calendar description) is unrelated and stays.

ALTER TABLE patients DROP COLUMN IF EXISTS notas;
