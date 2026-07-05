-- Pacientes module opened to therapists (Nicolas, 2026-07-04): they may now
-- UPDATE their own patients — the UI limits them to estado_general,
-- frecuencia and notas (expediente), and the WITH CHECK keeps them from
-- reassigning a patient away from themselves. DELETE stays owner-only
-- (patients_owner_all), as does INSERT beyond their own (patients_therapist_insert).
-- Applied via the Supabase connector as migration `patients_therapist_update`.

drop policy if exists patients_therapist_update on patients;
create policy patients_therapist_update on patients
  for update
  using (terapeuta_id = my_terapeuta_id())
  with check (terapeuta_id = my_terapeuta_id());
