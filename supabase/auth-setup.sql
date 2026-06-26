-- ============================================================================
-- Efimeramente Panel — GO-LIVE migration (run once, in order, in the Supabase
-- SQL editor). Safe to re-run: everything is guarded with IF NOT EXISTS / OR
-- REPLACE. Do this BEFORE adding VITE_SUPABASE_ANON_KEY to Netlify.
-- ============================================================================

-- 1) Per-patient fixed rate + default payment method ------------------------
alter table patients add column if not exists tarifa numeric not null default 39;
alter table patients add column if not exists metodo_pago text not null default 'transferencia';

-- Payment methods are now: transferencia | payphone | paypal | cash.
alter table sessions drop constraint if exists sessions_metodo_pago_check;
alter table sessions add constraint sessions_metodo_pago_check
  check (metodo_pago in ('transferencia','payphone','paypal','cash'));

-- 2) Profiles: link each auth user to a role (and, for therapists, a therapist)
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         text not null default 'therapist' check (role in ('owner','therapist')),
  terapeuta_id uuid references therapists(id),
  nombre       text,
  created_at   timestamptz default now()
);

-- 3) Helper functions (security definer so policies can read profiles without
--    recursing through RLS). ------------------------------------------------
create or replace function public.is_owner()
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner');
$$;

create or replace function public.my_terapeuta_id()
  returns uuid language sql stable security definer set search_path = public as $$
  select terapeuta_id from profiles where id = auth.uid();
$$;

-- 4) Row-Level Security ------------------------------------------------------
-- profiles: a user may read only their own row.
alter table profiles enable row level security;
drop policy if exists profiles_select_self on profiles;
create policy profiles_select_self on profiles for select using (id = auth.uid());

-- therapists: any signed-in user may read (names/colors for dropdowns); owner writes.
alter table therapists enable row level security;
drop policy if exists therapists_read on therapists;
create policy therapists_read on therapists for select using (auth.uid() is not null);
drop policy if exists therapists_owner_write on therapists;
create policy therapists_owner_write on therapists for all using (public.is_owner()) with check (public.is_owner());

-- patients: owner full; therapists may READ only their own patients (never create/edit).
alter table patients enable row level security;
drop policy if exists patients_owner_all on patients;
create policy patients_owner_all on patients for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists patients_therapist_read on patients;
create policy patients_therapist_read on patients for select using (terapeuta_id = public.my_terapeuta_id());

-- sessions: owner full; therapists full on their OWN sessions (schedule/reschedule/cancel).
alter table sessions enable row level security;
drop policy if exists sessions_access on sessions;
create policy sessions_access on sessions for all
  using (public.is_owner() or terapeuta_id = public.my_terapeuta_id())
  with check (public.is_owner() or terapeuta_id = public.my_terapeuta_id());

-- whatsapp_messages + facturas: owner only.
alter table whatsapp_messages enable row level security;
drop policy if exists whatsapp_owner on whatsapp_messages;
create policy whatsapp_owner on whatsapp_messages for all using (public.is_owner()) with check (public.is_owner());

alter table facturas enable row level security;
drop policy if exists facturas_owner on facturas;
create policy facturas_owner on facturas for all using (public.is_owner()) with check (public.is_owner());

-- ============================================================================
-- 5) Create the accounts, THEN link them here.
--    a. In Supabase: Authentication → Users → "Add user" (email + password)
--       for yourself (owner) and each of the 6 therapists.
--    b. Make sure each therapist exists in the `therapists` table; grab their id.
--    c. Run the inserts below with the real auth UIDs + therapist ids.
-- ----------------------------------------------------------------------------
-- insert into profiles (id, role, nombre) values
--   ('<OWNER_AUTH_UID>', 'owner', 'Nicolas');
--
-- insert into profiles (id, role, terapeuta_id, nombre) values
--   ('<AUTH_UID_MARIANA>',      'therapist', '<THERAPIST_ID_MARIANA>',      'Mariana Villegas'),
--   ('<AUTH_UID_CAROLINA>',     'therapist', '<THERAPIST_ID_CAROLINA>',     'Carolina Almeida'),
--   ('<AUTH_UID_DANIELA>',      'therapist', '<THERAPIST_ID_DANIELA>',      'Daniela Borja'),
--   ('<AUTH_UID_CAMILA>',       'therapist', '<THERAPIST_ID_CAMILA>',       'Camila Maya'),
--   ('<AUTH_UID_FRANCISCO>',    'therapist', '<THERAPIST_ID_FRANCISCO>',    'Francisco Mena'),
--   ('<AUTH_UID_MARIAGRACIA>',  'therapist', '<THERAPIST_ID_MARIAGRACIA>',  'Maria Gracia Villalba');
-- ============================================================================
