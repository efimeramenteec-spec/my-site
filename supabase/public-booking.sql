-- Public booking ("llamada") migration — run by hand in the Supabase SQL editor.
-- Adds the new 'llamada' session tipo, per-therapist booking config, and the
-- booking_attempts rate-limit table used by netlify/functions/public-booking.mjs.
-- Idempotent: safe to re-run.

-- 1. Allow tipo = 'llamada' on sessions.
--    Current values in use: individual, pareja (verified 2026-07-02).
alter table sessions drop constraint if exists sessions_tipo_check;
alter table sessions add constraint sessions_tipo_check
  check (tipo in ('individual', 'pareja', 'llamada'));

-- 2. Per-therapist public-booking config, edited by the owner in the app.
--    booking_availability holds weekly bookable windows in Ecuador local time.
--    Keys mon..sun; each day = array of [start, end] HH:MM ranges. Example:
--    {"mon":[["09:00","13:00"],["15:00","18:00"]],"tue":[["08:00","13:00"]]}
alter table therapists add column if not exists booking_enabled boolean not null default false;
alter table therapists add column if not exists booking_availability jsonb not null default '{}'::jsonb;

-- 3. Rate-limit ledger for the public booking function (service-role only).
--    One row per booking ATTEMPT; the function counts recent rows per phone/IP.
create table if not exists booking_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text,
  phone text,
  created_at timestamptz not null default now()
);
create index if not exists booking_attempts_created_at_idx on booking_attempts (created_at);

-- Lock it down: RLS on with NO policies ⇒ anon/authenticated can do nothing,
-- while the service role (used by the Netlify function) bypasses RLS.
alter table booking_attempts enable row level security;
revoke all on booking_attempts from anon, authenticated;
grant select, insert on booking_attempts to service_role;

-- 4. No new public RLS policies on patients/sessions/therapists — public reads
--    and writes go ONLY through the service-key Netlify function.
