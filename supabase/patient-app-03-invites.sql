-- Patient app — Phase 1: invite links a signup to an existing patients row.
-- Mirrors migration `patient_invites_phase1` (applied 2026-09-15).
create table public.patient_invites (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  used        boolean not null default false,
  used_at     timestamptz,
  expires_at  timestamptz not null default (now() + interval '30 days'),
  created_at  timestamptz not null default now()
);

alter table public.patient_invites enable row level security;
revoke all on public.patient_invites from anon;
grant select, insert, update on public.patient_invites to authenticated;

create policy invites_owner_all on public.patient_invites for all
  using (public.is_owner()) with check (public.is_owner());
create policy invites_therapist_manage on public.patient_invites for all
  using (exists (select 1 from public.patients p
                 where p.id = patient_invites.patient_id and p.terapeuta_id = public.my_terapeuta_id()))
  with check (exists (select 1 from public.patients p
                 where p.id = patient_invites.patient_id and p.terapeuta_id = public.my_terapeuta_id()));
