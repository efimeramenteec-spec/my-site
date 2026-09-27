-- Lead funnel — Phase D: fact sheet (funnel_knowledge) + T2 AI decision log.
-- BUILD #24 (three-tier free-text handling), decided 2026-09-26.
-- Applied in prod via the Supabase connector as migration
-- `lead_funnel_04_knowledge_and_ai_log`; kept here as the mirror copy.
--
-- WHY: free text from a lead used to fall back to a keyword menu and, when that
-- missed, got handed to Nicolás. This phase lets Claude (Anthropic API, Sonnet)
-- answer free text from a curated fact sheet, or DERIVE to a human when the fact
-- isn't covered / the message is a crisis / it's out of scope. Every T2 decision
-- is logged for audit. The keyword path stays only as the fallback if the API
-- fails or times out (>8s).
--
-- Additive only. No destructive DDL.

-- ── funnel_knowledge: the fact sheet the LLM answers from ────────────────────
-- One row per topic. The bot's T2 free-text handler passes ONLY these facts to
-- Claude; anything not covered here must be derived to a human. Editable in the
-- Marketing Module → Configuración. Home visits are DELIBERATELY absent (they go
-- to Nicolás), so a "¿atienden a domicilio?" question falls through to derivar.
create table if not exists funnel_knowledge (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,          -- stable topic key
  titulo text not null,                -- short label (shown in the editor + fact sheet)
  contenido text not null,             -- the confirmed fact(s)
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table funnel_knowledge enable row level security;
drop policy if exists funnel_knowledge_owner on funnel_knowledge;
create policy funnel_knowledge_owner on funnel_knowledge
  for all using (is_owner()) with check (is_owner());
grant select, insert, update, delete on funnel_knowledge to authenticated, service_role;

-- ── lead_ai_decisions: audit every T2 (free-text) decision ───────────────────
-- Shown in Marketing → Embudo so Nicolás can audit what the bot answered vs
-- derived. used_fallback = the LLM failed/timed out and the keyword path answered.
create table if not exists lead_ai_decisions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  phone text,
  texto_in text,                       -- the lead's free-text message
  accion text,                         -- 'responder' | 'derivar'
  motivo text,                         -- classifier reason (urgente, fuera_de_alcance, …)
  reply text,                          -- what the bot actually sent
  step text,                           -- the bot step the lead was on
  model text,                          -- model id, or 'keyword' on fallback
  latency_ms integer,
  used_fallback boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists lead_ai_decisions_created_idx on lead_ai_decisions(created_at desc);
create index if not exists lead_ai_decisions_lead_idx on lead_ai_decisions(lead_id);

alter table lead_ai_decisions enable row level security;
drop policy if exists lead_ai_decisions_owner on lead_ai_decisions;
create policy lead_ai_decisions_owner on lead_ai_decisions
  for all using (is_owner()) with check (is_owner());
grant select, insert, update, delete on lead_ai_decisions to authenticated, service_role;

-- ── Seed the fact sheet (confirmed facts only; ON CONFLICT keeps edits) ───────
insert into funnel_knowledge (clave, titulo, contenido, orden) values
  ('precio', 'Precio de la sesión',
   'La sesión individual cuesta $39. En paquete de 4 sesiones sale a $35 cada una ($140 en total). No hay costo de evaluación aparte: la primera sesión ya es una sesión completa.', 1),
  ('llamada_gratuita', 'Llamada gratuita de 10 minutos',
   'El primer paso es gratis: una llamada de 10 minutos con el/la terapeuta que elijas, para conocerse, contar brevemente qué buscas y resolver dudas antes de agendar una sesión. Se coordina por este mismo chat.', 2),
  ('ubicacion', 'Ubicación y parqueadero',
   'Estamos en Cumbayá, a 3 minutos del Scala. Tenemos parqueadero privado y seguro. Mapa: https://maps.app.goo.gl/GZAFUpC1SAyW8GBT8', 3),
  ('modalidad', 'Modalidad presencial u online',
   'Atendemos presencial en Cumbayá y también online por videollamada, según lo que prefieras.', 4),
  ('pago', 'Formas de pago',
   'Aceptamos transferencia bancaria y tarjeta de crédito o débito (Payphone). El paquete de 4 sesiones cuesta $140 ($35 c/u).', 5),
  ('seguros', 'Seguros y reembolso',
   'Muchos seguros privados reembolsan la terapia psicológica según el plan de cada persona. Bupa (planes Cuidado Total) y Humana reembolsan hasta el 80% fuera de red. BMI, por lo general, NO cubre psicología en sus contratos estándar. Para cualquier otra aseguradora no tenemos confirmación, así que conviene derivar a una persona del equipo. Entregamos la factura con el formato que piden las aseguradoras y ayudamos con el trámite.', 6),
  ('equipo', 'El equipo',
   'Somos Efimeramente, un equipo de psicólogos en Cumbayá. Puedes elegir a tu terapeuta según el tema que quieras trabajar (ansiedad, ánimo, pareja o familia, duelo, trauma, consumo, niños/adolescentes, etc.).', 7),
  ('agenda', 'Agendar la llamada',
   'Para agendar la llamada gratuita, la persona elige un terapeuta y luego un horario disponible dentro del mismo chat, tocando los botones. No hace falta llamar ni escribir un correo.', 8)
on conflict (clave) do nothing;
