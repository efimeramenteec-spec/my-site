-- supabase/lead-attribution-69.sql
-- #69 — fix the attribution leak. Additive only. Applied via apply_migration `lead_attribution_69`.
--
-- 1. Any lead with a ctwa_clid is an ad lead: source='meta_ctwa'. A BEFORE trigger makes it
--    impossible to recur from any write path (recordLead also sets it), + one-off backfill.
-- 2. funnel_v now covers ALL leads (organic too) with meta_tag = (ctwa_clid is not null) and
--    source appended — "everything is the campaign" internally (Nicolás, 8 Oct). Same #62
--    outage exclusion and es_prueba filter as #66.
-- 3. campaign_results_v — per day (Ecuador), from sessions, ANY source: new llamadas booked,
--    first real sessions (booked that day), first paid real sessions (paid that day).
--    [PRUEBA] test bookings excluded.

-- ── 1. source follows the click id ────────────────────────────────────────────
create or replace function public.leads_source_from_clid() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.ctwa_clid is not null and new.source is distinct from 'meta_ctwa' then
    new.source := 'meta_ctwa';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_leads_source_from_clid on public.leads;
create trigger trg_leads_source_from_clid
  before insert or update of ctwa_clid, source on public.leads
  for each row execute function public.leads_source_from_clid();

update public.leads set source = 'meta_ctwa', updated_at = now()
where ctwa_clid is not null and source is distinct from 'meta_ctwa';

-- ── 2. funnel_v: all leads + meta_tag (new columns appended at the end) ───────
create or replace view public.funnel_v with (security_invoker = true) as
with log_start as (select min(created_at) as at from public.lead_bot_sends)
select
  l.id as lead_id,
  l.ad_source_id,
  l.first_at,
  (select count(*) from public.whatsapp_messages w
     where w.direccion = 'inbound'
       and w.raw_payload->'contact'->>'wa_id' = regexp_replace(l.phone, '\D', '', 'g')
       and w.received_at >= l.first_at and w.received_at < l.first_at + interval '72 hours') >= 2 as replied,
  (select count(*) from public.lead_bot_sends s where s.lead_id = l.id) as bot_sends,
  exists (select 1 from public.lead_bot_sends s
            join public.whatsapp_delivery_status d on d.wamid = s.wamid
           where s.lead_id = l.id and d.status = 'read') as bot_read,
  exists (select 1 from public.lead_bot_sends s where s.lead_id = l.id and s.kind = 'link') as got_link,
  l.agendo_at is not null as booked,
  (select d.motivo from public.lead_ai_decisions d
     where d.lead_id = l.id and d.accion = 'derivar'
     order by d.created_at desc limit 1) as handoff_motivo,
  (coalesce(l.bot_paused, false)
     and not exists (select 1 from public.lead_ai_decisions d where d.lead_id = l.id and d.accion = 'derivar')) as manual_takeover,
  (select count(distinct i.processed_at) from public.lead_inbox i, log_start
     where i.lead_id = l.id and i.processed_at is not null
       and log_start.at is not null and i.processed_at >= log_start.at
       and not exists (select 1 from public.lead_bot_sends s
                        where s.lead_id = l.id
                          and s.created_at >= i.processed_at
                          and s.created_at < i.processed_at + interval '2 minutes')) as silent_turns,
  l.source,
  (l.ctwa_clid is not null) as meta_tag
from public.leads l
where l.es_prueba = false
  and not (l.first_at >= '2026-10-07 18:46+00' and l.first_at < '2026-10-08 18:30+00');

grant select on public.funnel_v to authenticated, service_role;

-- ── 3. campaign_results_v ─────────────────────────────────────────────────────
create or replace view public.campaign_results_v with (security_invoker = true) as
with real_s as (
  select s.patient_id, s.created_at, s.paid_at, s.fecha, s.pagado,
         row_number() over (partition by s.patient_id order by s.created_at, s.id) as rn_booked
  from public.sessions s
  where s.tipo <> 'llamada' and s.estado <> 'cancelada' and s.patient_id is not null
),
first_paid as (
  select distinct on (s.patient_id) s.patient_id,
         coalesce(s.paid_at, (s.fecha::timestamp at time zone 'America/Guayaquil')) as at
  from public.sessions s
  where s.tipo <> 'llamada' and s.estado <> 'cancelada' and s.pagado is true and s.patient_id is not null
  order by s.patient_id, s.fecha, s.hora_inicio, s.id
),
events as (
  select (s.created_at at time zone 'America/Guayaquil')::date as dia, 'llamada' as k
  from public.sessions s
  where s.tipo = 'llamada' and coalesce(s.notas, '') not like '[PRUEBA]%'
  union all
  select (created_at at time zone 'America/Guayaquil')::date, 'primera' from real_s where rn_booked = 1
  union all
  select (at at time zone 'America/Guayaquil')::date, 'primera_pagada' from first_paid
)
select dia,
       count(*) filter (where k = 'llamada')        as llamadas_agendadas,
       count(*) filter (where k = 'primera')        as primeras_sesiones,
       count(*) filter (where k = 'primera_pagada') as primeras_pagadas
from events
group by dia;

grant select on public.campaign_results_v to authenticated, service_role;
