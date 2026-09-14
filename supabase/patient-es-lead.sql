-- Leads vs patients (Nicolas, 2026-09-14).
-- A person who books a free llamada via the public /agendar link is a LEAD, not
-- a patient yet. They stay a lead until they convert (first real session OR the
-- llamada is toggled "Convirtió"), at which point es_lead flips to false.
-- The Pacientes list hides leads; a "Leads" tab shows them. Seguimiento excludes
-- leads. Marketing still sees everyone (funnel math). Sessions are unchanged —
-- es_lead is just a person-level flag, so all calendar/reminder/phone-matching
-- plumbing keeps working.
--
-- Applied via the Supabase connector as migration `patient_es_lead`.

alter table patients add column if not exists es_lead boolean not null default false;

-- Backfill: existing people whose ONLY sessions are (non-converted) llamadas and
-- who have never had a real (non-cancelled, non-llamada) session are leads.
-- People with zero sessions were created directly (not from a call) → stay patients.
update patients p set es_lead = true
where not exists (
    select 1 from sessions s
    where s.patient_id = p.id and s.tipo <> 'llamada' and s.estado <> 'cancelada'
  )
  and exists (
    select 1 from sessions s where s.patient_id = p.id and s.tipo = 'llamada'
  )
  and not exists (
    select 1 from sessions s
    where s.patient_id = p.id and s.tipo = 'llamada' and s.convirtio is true
  );
