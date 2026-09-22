-- Patient app — Phase 4: between-session pulse + journal.
-- Mirrors migration `patient_app_pulse_phase4` (applied 2026-09-16 to vnityzpuhnkumsyfnskz).
-- RLS mirrors session_checkins: patient reads/writes own; therapist reads their patients'
-- (journal only when the patient chose to share it).

-- 1) objective_ratings — patient self-rating of each map objective over time (0..4, "how close").
create table if not exists public.objective_ratings (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients(id) on delete cascade,
  objective_id uuid not null references public.map_objectives(id) on delete cascade,
  score        smallint not null check (score between 0 and 4),
  source       text not null default 'app' check (source in ('app','whatsapp')),
  session_id   uuid references public.sessions(id) on delete set null,
  created_at   timestamptz not null default now()
);
alter table public.objective_ratings enable row level security;
revoke all on public.objective_ratings from anon;
grant select, insert on public.objective_ratings to authenticated;
grant all on public.objective_ratings to service_role;

create policy objrate_patient_read on public.objective_ratings for select
  using (patient_id = public.my_patient_id());
create policy objrate_patient_insert on public.objective_ratings for insert
  with check (patient_id = public.my_patient_id()
    and exists (select 1 from public.map_objectives o
                where o.id = objective_id and o.patient_id = public.my_patient_id()));
create policy objrate_therapist_read on public.objective_ratings for select
  using (exists (select 1 from public.patients p
                 where p.id = objective_ratings.patient_id
                 and p.terapeuta_id = public.my_terapeuta_id()));

-- 2) prompts — rotating, non-clinical reflection prompts (shared content, read-only to patients).
create table if not exists public.prompts (
  id     uuid primary key default gen_random_uuid(),
  texto  text not null,
  orden  smallint not null default 1,
  active boolean not null default true
);
alter table public.prompts enable row level security;
revoke all on public.prompts from anon;
grant select on public.prompts to authenticated;
grant all on public.prompts to service_role;
create policy prompts_read on public.prompts for select using (true);

-- 3) journal_entries — the patient's own reflection space; therapist sees only what's shared.
create table if not exists public.journal_entries (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  prompt_id  uuid references public.prompts(id) on delete set null,
  content    text not null check (char_length(content) between 1 and 4000),
  shared     boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.journal_entries enable row level security;
revoke all on public.journal_entries from anon;
grant select, insert on public.journal_entries to authenticated;
grant all on public.journal_entries to service_role;

create policy journal_patient_read on public.journal_entries for select
  using (patient_id = public.my_patient_id());
create policy journal_patient_insert on public.journal_entries for insert
  with check (patient_id = public.my_patient_id());
create policy journal_therapist_read on public.journal_entries for select
  using (shared = true and exists (select 1 from public.patients p
                 where p.id = journal_entries.patient_id
                 and p.terapeuta_id = public.my_terapeuta_id()));

-- seed a few calm, non-clinical reflection prompts (only if empty)
insert into public.prompts (texto, orden)
select * from (values
  ('¿Qué pequeño avance notaste esta semana?', 1),
  ('¿Qué se te hizo más cuesta arriba estos días?', 2),
  ('¿Hubo algún momento en que te sentiste bien? ¿Qué pasó?', 3),
  ('¿Qué te gustaría llevar a tu próxima sesión?', 4),
  ('¿Qué te dirías a ti mismo(a) del inicio de este proceso?', 5)
) as v(texto, orden)
where not exists (select 1 from public.prompts);
