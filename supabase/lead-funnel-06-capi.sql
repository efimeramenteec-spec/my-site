-- supabase/lead-funnel-06-capi.sql
-- #22 Meta Conversions API (CAPI for Business Messaging) — Phase E of #4.
--
-- Every lead that came from a Click-to-WhatsApp ad reports Lead / Schedule /
-- Purchase back to Meta, keyed on its ctwa_clid, so the campaign can optimize for
-- Schedule (intro call booked) instead of "conversation started".
--
-- Additive only. ctwa_clid is captured going forward in whatsapp-cloud-webhook
-- (recordLead) and backfilled below from whatsapp_messages.raw_payload. The three
-- *_sent_at columns make each event fire at most once per lead (see capi.mjs).

alter table leads
  add column if not exists ctwa_clid text,
  add column if not exists capi_lead_sent_at timestamptz,
  add column if not exists capi_schedule_sent_at timestamptz,
  add column if not exists capi_purchase_sent_at timestamptz;

-- Sweep target: leads that carry a click id but still have an unsent event.
create index if not exists leads_ctwa_clid_idx on leads (ctwa_clid) where ctwa_clid is not null;

-- One-time backfill: take the EARLIEST inbound ad message per phone that carried a
-- ctwa_clid and stamp it onto the matching lead (digits-only phone match). 2026-09-27:
-- filled 11 of 11 meta_ctwa leads (the other 3 leads are organic, no click id).
with src as (
  select distinct on (regexp_replace(raw_payload->'message'->>'from','\D','','g'))
    regexp_replace(raw_payload->'message'->>'from','\D','','g') as from_digits,
    raw_payload->'message'->'referral'->>'ctwa_clid' as ctwa_clid
  from whatsapp_messages
  where raw_payload->'message'->'referral'->>'ctwa_clid' is not null
  order by regexp_replace(raw_payload->'message'->>'from','\D','','g'), received_at asc
)
update leads l
set ctwa_clid = src.ctwa_clid
from src
where l.ctwa_clid is null
  and regexp_replace(l.phone,'\D','','g') = src.from_digits;
