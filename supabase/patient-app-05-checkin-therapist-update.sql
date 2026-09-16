-- Patient app — Phase 1: therapist can re-tap their side (enables upsert).
-- Mirrors migration `checkin_therapist_update_phase1`.
grant update on public.session_checkins to authenticated;

create policy checkins_therapist_update on public.session_checkins for update
  using (side = 'therapist' and exists (
    select 1 from public.patients p
    where p.id = session_checkins.patient_id and p.terapeuta_id = public.my_terapeuta_id()))
  with check (side = 'therapist' and exists (
    select 1 from public.patients p
    where p.id = session_checkins.patient_id and p.terapeuta_id = public.my_terapeuta_id()));
