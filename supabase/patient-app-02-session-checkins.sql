-- Patient app — Phase 1: the mirrored check-in table + RLS.
-- Mirrors migration `session_checkins_phase1` (applied 2026-09-15).
create table public.session_checkins (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  side        text not null check (side in ('patient','therapist')),
  q_bond      smallint check (q_bond   between 0 and 2),
  q_tasks     smallint check (q_tasks  between 0 and 2),
  q_goals     smallint check (q_goals  between 0 and 2),
  t_progress  smallint check (t_progress between 0 and 2),
  source      text not null default 'app' check (source in ('app','whatsapp')),
  created_at  timestamptz not null default now(),
  unique (session_id, side),
  constraint checkin_shape check (
    (side='patient'   and t_progress is null
       and q_bond is not null and q_tasks is not null and q_goals is not null)
    or
    (side='therapist' and t_progress is not null
       and q_bond is null and q_tasks is null and q_goals is null)
  )
);

alter table public.session_checkins enable row level security;
revoke all on public.session_checkins from anon;
grant select, insert on public.session_checkins to authenticated;

create policy checkins_patient_read on public.session_checkins for select
  using (side='patient' and patient_id = public.my_patient_id());

create policy checkins_patient_insert on public.session_checkins for insert
  with check (
    side='patient' and source='app' and patient_id = public.my_patient_id()
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.patient_id = public.my_patient_id())
  );

create policy checkins_therapist_read on public.session_checkins for select
  using (exists (select 1 from public.patients p
                 where p.id = session_checkins.patient_id
                 and p.terapeuta_id = public.my_terapeuta_id()));

create policy checkins_therapist_insert on public.session_checkins for insert
  with check (
    side='therapist'
    and exists (select 1 from public.patients p
                where p.id = session_checkins.patient_id
                and p.terapeuta_id = public.my_terapeuta_id())
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.patient_id = session_checkins.patient_id)
  );
