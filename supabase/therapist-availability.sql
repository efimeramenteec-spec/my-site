-- Disponibilidad module for therapists — run by hand in the Supabase SQL editor.
-- Lets each therapist edit her OWN therapists row (booking_enabled +
-- booking_availability via the app's whitelisted write path). Owner keeps full
-- CRUD through the existing therapists_owner_write policy. Idempotent.
--
-- Note: RLS is row-level, so this technically allows a therapist to update any
-- column of her own row via the API. The app only ever writes the two booking
-- columns; the other self-columns (color, calendar_email) are hers anyway —
-- acceptable for this internal tool.

drop policy if exists therapists_self_update on therapists;
create policy therapists_self_update on therapists
  for update
  using (id = public.my_terapeuta_id())
  with check (id = public.my_terapeuta_id());
