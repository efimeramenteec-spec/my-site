-- Patient app on the shared DB — Phase 0: patient identity + access gate.
-- Mirrors migration `patient_role_phase0` (applied 2026-09-15).

-- 1. Link a patient login to an existing patients row (nullable; most null today)
alter table public.patients
  add column if not exists auth_user_id uuid unique references auth.users(id);

-- 2. Helper: is the caller staff (owner or therapist)?  Mirrors is_owner() style.
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path to 'public'
as $$ select exists (select 1 from profiles where id = auth.uid()); $$;
revoke execute on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated;

-- 3. Helper: the patients.id for the current patient login (null for staff/anon)
create or replace function public.my_patient_id()
returns uuid language sql stable security definer set search_path to 'public'
as $$ select id from patients where auth_user_id = auth.uid(); $$;
revoke execute on function public.my_patient_id() from public;
grant execute on function public.my_patient_id() to authenticated;

-- 4. Close the roster hole: therapists readable by STAFF only (was: any authenticated user).
drop policy if exists therapists_read on public.therapists;
create policy therapists_read on public.therapists
  for select using (public.is_staff());

-- 5. Patient self-access: a patient may read only their own identity + sessions.
create policy patients_self_read on public.patients
  for select using (id = public.my_patient_id());
create policy sessions_self_read on public.sessions
  for select using (patient_id = public.my_patient_id());
