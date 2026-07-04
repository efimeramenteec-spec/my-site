-- Finanzas module: per-session provision owed to each therapist (USD).
-- Applied in prod 2026-07-04 via the Supabase connector (migration
-- `therapist_provision_rate`). Idempotent — safe to re-run.
--
-- Reasoning (Nicolas): therapists are paid a flat $24 per non-cancelled
-- session each month, regardless of whether the patient paid ("cobrado" is
-- the practice's problem). Mariana Villegas co-owns the practice and keeps
-- 100% of her sessions, so her rate is 0. Keeping the rate per-therapist in
-- the DB lets rates change (or new therapists join) without a deploy.

ALTER TABLE public.therapists
  ADD COLUMN IF NOT EXISTS provision_rate numeric NOT NULL DEFAULT 24;

UPDATE public.therapists
   SET provision_rate = 0
 WHERE id = 'b219e764-4664-594c-9eb3-d2b19e52caac'; -- Mariana Villegas
