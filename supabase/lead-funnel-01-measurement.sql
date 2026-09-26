-- Lead funnel — Phase A: measurement (#4 + #20, decided 26 Sep 2026).
-- Applied in prod via the Supabase connector as migration
-- `lead_funnel_01_measurement`; kept here as the mirror copy.
--
-- WHY: baseline lead → call is 8%. The leak is lead → call booked, and the time
-- sink is Nicolás typing the same first replies by hand. This phase adds the
-- measurement spine (one `leads` row per phone, stage timestamps) plus the
-- therapist config the bot needs (recibe_nuevos, funnel_caption) and the
-- editable category→cards mapping (funnel_categorias). The bot itself (Phase B)
-- and follow-ups (Phase C) build on top of these tables.
--
-- Additive only. No destructive DDL.

-- ── leads: one row per phone, the funnel spine ───────────────────────────────
-- stage flow: nuevo → toco → eligio_terapeuta → agendo →
--             llamada_hecha / no_contesto → paciente | frio
-- source: 'meta_ctwa' when the inbound message carries a Click-to-WhatsApp
--         `referral` block, else 'whatsapp_organico'.
-- step_actual: the bot step the lead is currently sitting at, so a nudge can
--              resume where they went silent.
-- bot_paused: set true forever once Nicolás replies manually in that chat
--             (detected via smb_message_echoes) or on an "Otra pregunta" tap.
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,                 -- normalized E.164
  wa_name text,                               -- WhatsApp profile name
  first_at timestamptz not null default now(),
  source text not null default 'whatsapp_organico',  -- meta_ctwa | whatsapp_organico
  ad_source_id text,                          -- referral.source_id
  ad_headline text,                           -- referral.headline
  stage text not null default 'nuevo',
  -- one timestamp per stage transition (first_at doubles as nuevo_at)
  toco_at timestamptz,
  eligio_terapeuta_at timestamptz,
  agendo_at timestamptz,
  llamada_hecha_at timestamptz,
  no_contesto_at timestamptz,
  paciente_at timestamptz,
  frio_at timestamptz,
  -- bot flow state
  step_actual text,
  nudges_sent integer not null default 0,
  bot_paused boolean not null default false,
  last_bot_at timestamptz,                    -- when the bot last sent this lead something
  categoria text,                             -- chosen "¿Qué te gustaría trabajar?" category
  -- links out to the rest of the model
  therapist_id uuid references therapists(id),
  patient_id uuid references patients(id),
  session_id uuid references sessions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_stage_idx on leads(stage);
create index if not exists leads_therapist_idx on leads(therapist_id);
create index if not exists leads_first_at_idx on leads(first_at);

-- RLS: owner-only, like campaigns (the funnel dashboard is in the owner-only
-- Marketing Module). The bot writes via service_role, which bypasses RLS.
alter table leads enable row level security;
drop policy if exists leads_owner on leads;
create policy leads_owner on leads
  for all using (is_owner()) with check (is_owner());
grant select, insert, update, delete on leads to authenticated, service_role;

-- ── therapists.recibe_nuevos: bot on/off per therapist ───────────────────────
-- Separate from booking_enabled (which drives the free-call links). The bot only
-- shows therapists with this on; the category→cards mapping reflows around it.
-- OFF for Daniela (flips on when she opens her schedule) and Mariana (excluded
-- permanently — always full, patients come by direct referral). ON for the rest.
alter table therapists add column if not exists recibe_nuevos boolean not null default false;

-- ── therapists.funnel_caption: card body text shown by the bot ───────────────
alter table therapists add column if not exists funnel_caption text;

-- ── funnel_categorias: editable category → ordered therapist mapping ─────────
-- The bot filters this list by recibe_nuevos, then shows the first 3 cards.
-- `terapeutas` is an ordered array of therapist ids. `especial` flags the two
-- rules that can't be expressed as a fixed list:
--   'no_seguro' — "No estoy seguro(a)": 3 soonest-available active therapists,
--                 Francisco always included.
-- `orden` drives display order of the categories in the list message.
create table if not exists funnel_categorias (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,          -- stable key used in bot payloads
  etiqueta text not null,              -- Spanish label shown in the list
  orden integer not null default 0,
  terapeutas uuid[] not null default '{}',  -- ordered therapist ids (empty when especial)
  especial text,                       -- null | 'no_seguro'
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table funnel_categorias enable row level security;
drop policy if exists funnel_categorias_owner on funnel_categorias;
create policy funnel_categorias_owner on funnel_categorias
  for all using (is_owner()) with check (is_owner());
-- Bot reads via service_role (bypasses RLS); owner edits in the Marketing Module.
grant select, insert, update, delete on funnel_categorias to authenticated, service_role;

-- ── Seed (run once via execute_sql; therapist ids are the stable prod ids) ────
-- recibe_nuevos: on for the pool, off for Daniela (until she opens) + Mariana (excluded).
update therapists set recibe_nuevos = true  where id in (
  '2f5bf11b-42a8-562f-99c9-501c62a4ca04', 'df43d23e-52f2-511f-9d66-77de36ebd67d',
  'aaf55d12-e51c-5197-ad4f-29c87bd859c8', '48a4a020-8ab4-5e11-89ed-17a1e1713b54',
  'f8c5e1fb-5c10-4ea2-95e4-1d6c34a5c1bc');
update therapists set recibe_nuevos = false where id in (
  '4eb27d28-e3bf-5194-aa30-9e5a185a26c1', 'b219e764-4664-594c-9eb3-d2b19e52caac');

-- funnel_caption (Mariana intentionally null — no card, never in the pool).
update therapists set funnel_caption = 'Francisco trabaja con ansiedad, depresión, duelos y rupturas, burnout y consumo. Enfoque cognitivo-conductual y centrado en soluciones.' where id='2f5bf11b-42a8-562f-99c9-501c62a4ca04';
update therapists set funnel_caption = 'María Gracia trabaja con ansiedad, depresión y duelos en adultos, y con niños y sus padres. Enfoque cognitivo-conductual y familiar.' where id='df43d23e-52f2-511f-9d66-77de36ebd67d';
update therapists set funnel_caption = 'Camila trabaja con niños, adolescentes y adultos: ánimo, ansiedad, TDAH, autismo y TOC. Enfoque cognitivo-conductual.' where id='aaf55d12-e51c-5197-ad4f-29c87bd859c8';
update therapists set funnel_caption = 'Carolina trabaja con adultos y parejas: ansiedad, autoestima, duelo, separaciones y dinámica familiar. Enfoque integrativo y sistémico.' where id='48a4a020-8ab4-5e11-89ed-17a1e1713b54';
update therapists set funnel_caption = 'Sophia trabaja con adultos: trauma, duelo, depresión, ansiedad y conductas de riesgo o consumo. Enfoque de 3ra generación y de esquemas.' where id='f8c5e1fb-5c10-4ea2-95e4-1d6c34a5c1bc';
update therapists set funnel_caption = 'Daniela trabaja con adultos: ansiedad, ánimo, estrés laboral, pareja, apego y autoestima. Enfoque cognitivo-conductual, ACT y DBT.' where id='4eb27d28-e3bf-5194-aa30-9e5a185a26c1';

-- funnel_categorias: category → ordered therapist ids (bot filters by recibe_nuevos, takes first 3).
insert into funnel_categorias (clave, etiqueta, orden, terapeutas, especial) values
  ('ansiedad',   'Ansiedad',              1, array['2f5bf11b-42a8-562f-99c9-501c62a4ca04','4eb27d28-e3bf-5194-aa30-9e5a185a26c1','df43d23e-52f2-511f-9d66-77de36ebd67d','aaf55d12-e51c-5197-ad4f-29c87bd859c8']::uuid[], null),
  ('tristeza',   'Tristeza o ánimo',      2, array['aaf55d12-e51c-5197-ad4f-29c87bd859c8','2f5bf11b-42a8-562f-99c9-501c62a4ca04','4eb27d28-e3bf-5194-aa30-9e5a185a26c1','df43d23e-52f2-511f-9d66-77de36ebd67d']::uuid[], null),
  ('pareja',     'Pareja o familia',      3, array['48a4a020-8ab4-5e11-89ed-17a1e1713b54','4eb27d28-e3bf-5194-aa30-9e5a185a26c1']::uuid[], null),
  ('duelo',      'Duelo o ruptura',       4, array['2f5bf11b-42a8-562f-99c9-501c62a4ca04','4eb27d28-e3bf-5194-aa30-9e5a185a26c1','df43d23e-52f2-511f-9d66-77de36ebd67d','48a4a020-8ab4-5e11-89ed-17a1e1713b54']::uuid[], null),
  ('trauma',     'Trauma',                5, array['f8c5e1fb-5c10-4ea2-95e4-1d6c34a5c1bc','4eb27d28-e3bf-5194-aa30-9e5a185a26c1','2f5bf11b-42a8-562f-99c9-501c62a4ca04','48a4a020-8ab4-5e11-89ed-17a1e1713b54']::uuid[], null),
  ('sustancias', 'Alcohol o sustancias',  6, array['f8c5e1fb-5c10-4ea2-95e4-1d6c34a5c1bc','4eb27d28-e3bf-5194-aa30-9e5a185a26c1','2f5bf11b-42a8-562f-99c9-501c62a4ca04']::uuid[], null),
  ('hijo',       'Es para mi hijo(a)',    7, array['aaf55d12-e51c-5197-ad4f-29c87bd859c8','df43d23e-52f2-511f-9d66-77de36ebd67d','2f5bf11b-42a8-562f-99c9-501c62a4ca04']::uuid[], null),
  ('no_seguro',  'No estoy seguro(a)',    8, '{}'::uuid[], 'no_seguro')
on conflict (clave) do nothing;
