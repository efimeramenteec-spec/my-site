-- Patient app — Phase 3: onboarding tables (objectives, first-session feeling, clinical baseline).
-- Mirrors migration `patient_app_onboarding_phase3` (applied 2026-09-16 to vnityzpuhnkumsyfnskz).
-- RLS mirrors the session_checkins pattern: patient reads/writes own rows; therapist reads their patients'.

-- 1) map_objectives — goals in the patient's own words = the goals component of alliance. The map is born from these.
create table if not exists public.map_objectives (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients(id) on delete cascade,
  texto       text not null check (char_length(texto) between 1 and 280),
  orden       smallint not null default 1,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.map_objectives enable row level security;
revoke all on public.map_objectives from anon;
grant select, insert, update on public.map_objectives to authenticated;
grant all on public.map_objectives to service_role;

create policy map_obj_patient_read on public.map_objectives for select
  using (patient_id = public.my_patient_id());
create policy map_obj_patient_insert on public.map_objectives for insert
  with check (patient_id = public.my_patient_id());
create policy map_obj_patient_update on public.map_objectives for update
  using (patient_id = public.my_patient_id())
  with check (patient_id = public.my_patient_id());
create policy map_obj_therapist_read on public.map_objectives for select
  using (exists (select 1 from public.patients p
                 where p.id = map_objectives.patient_id
                 and p.terapeuta_id = public.my_terapeuta_id()));

-- 2) session_feelings — post-session-1 multi-select mood (expectations signal).
create table if not exists public.session_feelings (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients(id) on delete cascade,
  session_id  uuid references public.sessions(id) on delete set null,
  feelings    text[] not null default '{}',
  created_at  timestamptz not null default now()
);
alter table public.session_feelings enable row level security;
revoke all on public.session_feelings from anon;
grant select, insert on public.session_feelings to authenticated;
grant all on public.session_feelings to service_role;

create policy feel_patient_read on public.session_feelings for select
  using (patient_id = public.my_patient_id());
create policy feel_patient_insert on public.session_feelings for insert
  with check (patient_id = public.my_patient_id());
create policy feel_therapist_read on public.session_feelings for select
  using (exists (select 1 from public.patients p
                 where p.id = session_feelings.patient_id
                 and p.terapeuta_id = public.my_terapeuta_id()));

-- 3) assessments — PHQ-8 / GAD-7. context splits onboarding baseline from monthly.
create table if not exists public.assessments (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references public.patients(id) on delete cascade,
  type           text not null check (type in ('phq8','gad7')),
  total_score    smallint not null,
  responses      jsonb,
  context        text not null default 'baseline' check (context in ('baseline','monthly')),
  administered_at timestamptz not null default now()
);
alter table public.assessments enable row level security;
revoke all on public.assessments from anon;
grant select, insert on public.assessments to authenticated;
grant all on public.assessments to service_role;

create policy assess_patient_read on public.assessments for select
  using (patient_id = public.my_patient_id());
create policy assess_patient_insert on public.assessments for insert
  with check (patient_id = public.my_patient_id());
create policy assess_therapist_read on public.assessments for select
  using (exists (select 1 from public.patients p
                 where p.id = assessments.patient_id
                 and p.terapeuta_id = public.my_terapeuta_id()));
