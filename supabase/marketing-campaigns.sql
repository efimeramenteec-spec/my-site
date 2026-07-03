-- Marketing module: campaigns + funnel attribution (2026-07-03).
-- Owner-only feature. Applied in prod via the Supabase connector
-- (migration `marketing_campaigns`); kept here as the mirror copy.
--
--   campaigns         — one row per Meta Ads campaign. Top-of-funnel TOTALS
--                       (spend/impressions/clicks/conversations) live here and
--                       are the single source of truth for the UI. A CSV import
--                       recomputes them from the daily rows; manual edits just
--                       overwrite them (a later import wins).
--   campaign_metrics  — daily breakdown rows from Meta CSV reports, upserted
--                       by (campaign_id, fecha) so re-importing an updated
--                       report never double-counts.
--   patients.fuente   — acquisition source: 'ads' | 'referido' | 'organico' | 'otro'
--                       (labels in src/lib/constants.js FUENTE_PACIENTE).
--   patients.campaign_id / sessions.campaign_id — attribution stamped by
--                       public-booking.mjs when a booking arrives through a
--                       per-campaign link (/agendar?c=<slug>), or set by hand
--                       in the Pacientes page.

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null unique,
  fecha_inicio date not null default current_date,
  fecha_fin date,
  activa boolean not null default true,
  -- Top-of-funnel totals (see header note).
  spend numeric not null default 0,
  impressions integer not null default 0,
  clicks integer not null default 0,
  conversations integer not null default 0,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaign_metrics (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  fecha date not null,
  spend numeric not null default 0,
  impressions integer not null default 0,
  clicks integer not null default 0,
  conversations integer not null default 0,
  created_at timestamptz not null default now(),
  unique (campaign_id, fecha)
);

alter table patients add column if not exists fuente text;
alter table patients add column if not exists campaign_id uuid references campaigns(id);
alter table sessions add column if not exists campaign_id uuid references campaigns(id);

-- RLS: owner-only (service_role bypasses RLS for the booking function).
alter table campaigns enable row level security;
alter table campaign_metrics enable row level security;

drop policy if exists campaigns_owner on campaigns;
create policy campaigns_owner on campaigns
  for all using (is_owner()) with check (is_owner());

drop policy if exists campaign_metrics_owner on campaign_metrics;
create policy campaign_metrics_owner on campaign_metrics
  for all using (is_owner()) with check (is_owner());

-- The blanket grants predate these tables; grant explicitly.
grant select, insert, update, delete on campaigns, campaign_metrics to authenticated, service_role;
