-- #66 — one row per real ad lead: the full funnel, joined to the bot's own sends
-- (lead_bot_sends) and their receipts (whatsapp_delivery_status). Read-only.
-- Applied via apply_migration `funnel_v_66`.
--
-- Scope: source='meta_ctwa', es_prueba=false, EXCLUDING leads whose first_at
-- falls in the #62 outage (bot silent) 2026-10-07 18:46+00 → 2026-10-08 18:30+00.
-- silent_turns counts TURNS (a turn's lead_inbox rows share one processed_at)
-- with no bot send in the 2 min after processed_at, and only turns processed
-- after send logging began (min lead_bot_sends.created_at) — older turns have
-- no log rows to compare against.

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
                          and s.created_at < i.processed_at + interval '2 minutes')) as silent_turns
from public.leads l
where l.source = 'meta_ctwa'
  and l.es_prueba = false
  and not (l.first_at >= '2026-10-07 18:46+00' and l.first_at < '2026-10-08 18:30+00');

grant select on public.funnel_v to authenticated, service_role;
