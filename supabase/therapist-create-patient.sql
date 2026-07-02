-- ============================================================================
-- Let therapists CREATE their own patients (inline from the session scheduler).
-- Run once in the Supabase SQL editor. Idempotent.
--
-- Context: auth-setup.sql gives therapists SELECT on only their own patients
-- (`patients_therapist_read`) and no write. This adds an INSERT policy so a
-- therapist can create a patient, but ONLY one assigned to themselves — the
-- WITH CHECK forces terapeuta_id = my_terapeuta_id(). Owner access is unchanged
-- (patients_owner_all already grants owner full CRUD). Therapists still cannot
-- UPDATE/DELETE patients; edits stay owner-only.
-- ============================================================================

drop policy if exists patients_therapist_insert on patients;
create policy patients_therapist_insert on patients for insert
  with check (terapeuta_id = public.my_terapeuta_id());
