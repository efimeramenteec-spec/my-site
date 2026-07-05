-- Patient states redefined (Nicolas, 2026-07-04): activo (default) |
-- inactivo (hasn't come back but might) | descontinuado (gone or explicitly
-- quit). Replaces the never-understood pausado/alta/baja set. Inactivo and
-- descontinuado patients are excluded from Seguimiento tracking (adherence,
-- pacientes en riesgo) — no point tracking someone not expected to come.
-- Applied via the Supabase connector as migration `patient_estado_overhaul`.

update patients set estado_general = 'inactivo' where estado_general = 'pausado';
update patients set estado_general = 'descontinuado' where estado_general in ('alta', 'baja');

alter table patients drop constraint if exists patients_estado_general_check;
alter table patients add constraint patients_estado_general_check
  check (estado_general in ('activo', 'inactivo', 'descontinuado'));
alter table patients alter column estado_general set default 'activo';
