-- Marketing module v2 (2026-07-13) — full redo of the 2026-07-03 design.
-- Applied in prod via the Supabase connector (migration `marketing_v2`);
-- kept here as the mirror copy. See MARKETING-CONSULTORIO-2026.md for the
-- protocol this schema serves.
--
-- WHY THE REDO: v1 attributed patients through per-campaign booking links
-- (?c=<slug>) and a manual Fuente field — unrealistic, since leads arrive by
-- WhatsApp, not tagged links. v2 rule: only ONE Meta campaign runs at a time,
-- so every new patient (first real session) is attributed to the campaign
-- active on the date their first session was BOOKED (sessions.created_at).
-- Attribution is computed at query time from campaign date ranges — nothing
-- is stamped on patients/sessions anymore.
--
--   campaigns       — one row per Meta campaign, matched by the EXACT Meta
--                     campaign name from the weekly report. fecha_inicio /
--                     fecha_fin define the attribution window (fin NULL =
--                     still running). /marketize auto-creates rows for new
--                     names and keeps windows current.
--   campaign_weeks  — one row per campaign per weekly Meta report (the
--                     EFIMERAMENTE-SEMANAL scheduled email). Upserted by
--                     (campaign_id, semana_inicio) so re-imports never
--                     double-count. Weekly grain by design: matches the
--                     Monday cadence and makes 7-day frequency (the creative
--                     fatigue signal) directly meaningful.
--   patients.fuente — KEPT from v1 as the referral escape hatch: patients
--                     marked 'referido' are EXCLUDED from campaign
--                     attribution; every other new patient follows the
--                     date rule automatically.
--
-- v1 leftovers dropped here: campaign_metrics (daily rows), the slug/totals
-- columns, and the stamped patients.campaign_id / sessions.campaign_id.

-- PHASE 1 (migration `marketing_v2`): tables. PHASE 2 (`marketing_v2_drop_columns`,
-- run only AFTER the cleaned-up public-booking.mjs is live — the old function
-- inserts campaign_id on every booking and would 500 against dropped columns):
--   alter table patients drop column if exists campaign_id;
--   alter table sessions drop column if exists campaign_id;

drop table if exists campaign_metrics;
drop table if exists campaign_weeks;
drop table if exists campaigns cascade;

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,          -- exact Meta campaign name
  fecha_inicio date not null,           -- attribution window start
  fecha_fin date,                       -- NULL = currently running
  presupuesto_diario numeric,           -- informative only (from Meta report)
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table campaign_weeks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  semana_inicio date not null,          -- report range start (Mon..Sun from Meta)
  semana_fin date not null,
  spend numeric not null default 0,
  impressions integer not null default 0,
  reach integer not null default 0,
  frequency numeric not null default 0,   -- 7-day frequency, straight from Meta
  link_clicks integer not null default 0,
  ctr numeric not null default 0,         -- link CTR %, straight from Meta
  cpm numeric not null default 0,
  conversations integer not null default 0, -- conversaciones de mensajería iniciadas
  created_at timestamptz not null default now(),
  unique (campaign_id, semana_inicio)
);

-- RLS: owner-only (Claude/marketize writes via service_role, which bypasses RLS).
alter table campaigns enable row level security;
alter table campaign_weeks enable row level security;

create policy campaigns_owner on campaigns
  for all using (is_owner()) with check (is_owner());
create policy campaign_weeks_owner on campaign_weeks
  for all using (is_owner()) with check (is_owner());

grant select, insert, update, delete on campaigns, campaign_weeks to authenticated, service_role;
