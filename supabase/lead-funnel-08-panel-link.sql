-- supabase/lead-funnel-08-panel-link.sql
-- #34 — close the CAPI hole: leads Nicolás handles by hand (bot_paused) never
-- reach the panel, so leads.stage / patient_id / session_id stay frozen and the
-- CAPI sweep never fires QualifiedLead / Purchase for them — the best leads.
--
-- Fix: DB triggers (not server code) so EVERY write path links the lead —
-- panel by owner OR therapist (leads RLS is owner-only, a therapist's client
-- can't touch it), public-booking, and the bot itself. SECURITY DEFINER runs as
-- the table owner and bypasses RLS. All updates are "only if null" / "only
-- forward", so re-running or the bot double-writing is harmless (idempotent).
--
-- Matching is by the last 9 phone digits. Verified 2026-10-01: no lead matches
-- more than one patient by last-9 (leads are unique by last-9), so linking is
-- unambiguous. Additive only.

-- ── stage ordering (never move a lead backwards) ─────────────────────────────
-- Mirrors leadBot.mjs CORE + the post-call stages. frio/no_contesto rank below
-- the outcome they can still progress into, so a cold lead that later books by
-- hand still advances.
create or replace function lead_stage_rank(stage text) returns int
language sql immutable as $$
  select case stage
    when 'nuevo' then 0
    when 'toco' then 1
    when 'eligio_terapeuta' then 2
    when 'frio' then 2
    when 'agendo' then 3
    when 'no_contesto' then 3
    when 'llamada_hecha' then 4
    when 'paciente' then 5
    else 0
  end;
$$;

-- ── sessions → leads ─────────────────────────────────────────────────────────
-- A session was created/updated for a patient whose phone matches a lead:
--   • always backfill leads.patient_id (if null)  → enables CAPI Purchase
--   • tipo='llamada'           → session_id (if null) + advance to 'agendo'
--                                (agendo_at if null) → enables CAPI QualifiedLead
--   • paid real (non-llamada)  → advance to 'paciente' (paciente_at if null),
--                                session_id (if null)
create or replace function lead_link_from_session() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_l9   text;
  v_lead leads%rowtype;
  v_patch_patient uuid;
  v_patch_session uuid;
  v_patch_stage   text;
  v_set_agendo    boolean := false;
  v_set_paciente  boolean := false;
begin
  if new.patient_id is null then return new; end if;

  select right(regexp_replace(telefono, '\D', '', 'g'), 9) into v_l9
  from patients where id = new.patient_id;
  if v_l9 is null or length(v_l9) < 9 then return new; end if;

  -- leads are unique by last-9, so at most one matches
  select * into v_lead from leads
  where right(regexp_replace(phone, '\D', '', 'g'), 9) = v_l9
  limit 1;
  if v_lead.id is null then return new; end if;

  -- patient_id (for Purchase)
  if v_lead.patient_id is null then v_patch_patient := new.patient_id; end if;

  if new.tipo = 'llamada' then
    if v_lead.session_id is null then v_patch_session := new.id; end if;
    if lead_stage_rank('agendo') > lead_stage_rank(v_lead.stage) then
      v_patch_stage := 'agendo';
    end if;
    if v_lead.agendo_at is null then v_set_agendo := true; end if;
  elsif new.pagado is true then
    if v_lead.session_id is null then v_patch_session := new.id; end if;
    if lead_stage_rank('paciente') > lead_stage_rank(v_lead.stage) then
      v_patch_stage := 'paciente';
    end if;
    if v_lead.paciente_at is null then v_set_paciente := true; end if;
  end if;

  if v_patch_patient is null and v_patch_session is null
     and v_patch_stage is null and not v_set_agendo and not v_set_paciente then
    return new;
  end if;

  update leads set
    patient_id  = coalesce(v_patch_patient, patient_id),
    session_id  = coalesce(v_patch_session, session_id),
    stage       = coalesce(v_patch_stage, stage),
    agendo_at   = case when v_set_agendo   then now() else agendo_at   end,
    paciente_at = case when v_set_paciente then now() else paciente_at end,
    updated_at  = now()
  where id = v_lead.id;

  return new;
end;
$$;

drop trigger if exists trg_lead_link_from_session on sessions;
create trigger trg_lead_link_from_session
  after insert or update of patient_id, tipo, pagado on sessions
  for each row execute function lead_link_from_session();

-- ── patients → leads ─────────────────────────────────────────────────────────
-- A patient created/edited from the panel whose phone matches an unlinked lead:
-- backfill leads.patient_id so the sweep can later detect a Purchase. No stage
-- change here — creating a patient record isn't itself a funnel event; the
-- sessions trigger owns stage progression.
create or replace function lead_link_from_patient() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_l9 text;
begin
  v_l9 := right(regexp_replace(coalesce(new.telefono, ''), '\D', '', 'g'), 9);
  if length(v_l9) < 9 then return new; end if;

  update leads set patient_id = new.id, updated_at = now()
  where patient_id is null
    and right(regexp_replace(phone, '\D', '', 'g'), 9) = v_l9;

  return new;
end;
$$;

drop trigger if exists trg_lead_link_from_patient on patients;
create trigger trg_lead_link_from_patient
  after insert or update of telefono on patients
  for each row execute function lead_link_from_patient();
