-- Lead funnel v2 (#27) — "answer first, then offer".
-- Additive schema + config reseed. Applied to project vnityzpuhnkumsyfnskz via the
-- Supabase connector on 2026-09-27. Mirror only; safe to re-run (idempotent).

-- 1. Additive columns ────────────────────────────────────────────────────────
-- therapist gender → drives the "Quiero conocerlo/la" button + call-explanation copy.
alter table therapists add column if not exists genero text; -- 'M' | 'F'
-- reason-list row descriptions (WhatsApp interactive list description, ≤72 chars).
alter table funnel_categorias add column if not exists descripcion text;
-- one-per-lead flag: the "¿Te gustaría ver a nuestros terapeutas?" invitation is offered ONCE.
alter table leads add column if not exists invitacion_enviada boolean not null default false;

-- 2. Therapist gender ─────────────────────────────────────────────────────────
update therapists set genero = case when nombre = 'Francisco' then 'M' else 'F' end
where nombre in ('Camila','Carolina','Daniela','Francisco','Maria Gracia','Mariana','Sophia');

-- 3. Reason list (10 rows). Deactivate the legacy 8 (recoverable), upsert the new. ─
-- Provisional routing — replaced when the "Mapa de casos" survey answers arrive.
-- Filter is recibe_nuevos + first 3 + Francisco never bumped (enforced in leadBot).
-- especial: 'hijo' (kids line in the call explanation), 'diagnostico'/'varios'
-- (free-text prompt → Claude matches therapists), 'otro' (handoff to Nicolás).
update funnel_categorias set activo = false, updated_at = now();

insert into funnel_categorias (clave, etiqueta, descripcion, orden, terapeutas, especial, activo) values
  ('hijo',               'Es para mi hijo/a',      'Quiero que atiendan a mi hijo/a',                                1, array['aaf55d12-e51c-5197-ad4f-29c87bd859c8','df43d23e-52f2-511f-9d66-77de36ebd67d','2f5bf11b-42a8-562f-99c9-501c62a4ca04']::uuid[], 'hijo',        true),
  ('ruptura',            'Atravieso una ruptura',  'Acabo de terminar una relación y me está costando',              2, array['2f5bf11b-42a8-562f-99c9-501c62a4ca04','4eb27d28-e3bf-5194-aa30-9e5a185a26c1','df43d23e-52f2-511f-9d66-77de36ebd67d','48a4a020-8ab4-5e11-89ed-17a1e1713b54']::uuid[], null, true),
  ('problemas_pareja',   'Problemas de pareja',    'Quiero terapia para saber qué hacer en mi relación',             3, array['48a4a020-8ab4-5e11-89ed-17a1e1713b54','4eb27d28-e3bf-5194-aa30-9e5a185a26c1','2f5bf11b-42a8-562f-99c9-501c62a4ca04']::uuid[], null, true),
  ('depresion_ansiedad', 'Depresión o ansiedad',   'Siento depresión o ansiedad y está afectando mi vida',           4, array['2f5bf11b-42a8-562f-99c9-501c62a4ca04','4eb27d28-e3bf-5194-aa30-9e5a185a26c1','aaf55d12-e51c-5197-ad4f-29c87bd859c8','df43d23e-52f2-511f-9d66-77de36ebd67d']::uuid[], null, true),
  ('consumo',            'Consumo de sustancias',  'Yo o alguien cercano tiene problemas con alcohol o drogas',      5, array['f8c5e1fb-5c10-4ea2-95e4-1d6c34a5c1bc','4eb27d28-e3bf-5194-aa30-9e5a185a26c1','2f5bf11b-42a8-562f-99c9-501c62a4ca04']::uuid[], null, true),
  ('terapia_pareja',     'Busco terapia de pareja','Mi pareja y yo necesitamos terapia',                             6, array['48a4a020-8ab4-5e11-89ed-17a1e1713b54']::uuid[], null, true),
  ('diagnostico',        'Tengo un diagnóstico',   'Tengo un diagnóstico psicológico (o lo sospecho) y busco apoyo', 7, array[]::uuid[], 'diagnostico', true),
  ('trauma',             'Trauma',                 'Viví algo que no logro superar solo/a',                          8, array['f8c5e1fb-5c10-4ea2-95e4-1d6c34a5c1bc','4eb27d28-e3bf-5194-aa30-9e5a185a26c1','2f5bf11b-42a8-562f-99c9-501c62a4ca04','48a4a020-8ab4-5e11-89ed-17a1e1713b54']::uuid[], null, true),
  ('varios',             'Varios motivos',         'Atravieso varias situaciones a la vez',                          9, array[]::uuid[], 'varios', true),
  ('otro',               'Otro motivo',            'Cuéntanos y te orientamos',                                     10, array[]::uuid[], 'otro', true)
on conflict (clave) do update set
  etiqueta = excluded.etiqueta, descripcion = excluded.descripcion, orden = excluded.orden,
  terapeutas = excluded.terapeutas, especial = excluded.especial, activo = true, updated_at = now();

-- 4. Fact-sheet additions (funnel_knowledge — the Claude tier-2 knowledge base). ─
update funnel_knowledge set contenido =
'Muchos seguros privados reembolsan la terapia psicológica según el plan de cada persona. Bupa reembolsa hasta el 80% (solo planes Cuidado Total, con un tope anual según tu plan). Humana reembolsa hasta el 80%. BMI, por lo general, NO cubre psicología. Saludsa y Ecuasanitas sí reembolsan por trámite (los detalles exactos están por confirmar). Para cualquier otra aseguradora no tenemos confirmación: en ese caso deriva a una persona del equipo. Entregamos la factura con el formato que piden y ayudamos con el trámite.'
where clave = 'seguros';

insert into funnel_knowledge (clave, titulo, contenido, orden, activo) values
  ('terapia_pareja', 'Terapia de pareja', 'La especialista en pareja es Carolina Almeida. Las sesiones de pareja duran una hora y media (90 minutos) y cuestan $50. También hay un paquete de 4 sesiones de pareja a $42 cada una.', 9, true),
  ('duracion_frecuencia', 'Duración y frecuencia', 'Las sesiones individuales duran una hora (60 minutos). La frecuencia suele ser cada 7 o cada 15 días, según tu preferencia y lo que recomiende el terapeuta después de la primera sesión.', 10, true),
  ('horario', 'Horario de atención', 'Atendemos de lunes a sábado, de 8am a 8pm, siempre con cita previa y en coordinación con tu terapeuta. No atendemos domingos.', 11, true),
  ('psiquiatria', 'Psiquiatría y medicación', 'No tenemos un psiquiatra propio del centro, pero trabajamos en conjunto con el Dr. Camino cuando el caso lo requiere. Primero se hace una valoración psicológica y, si se recomienda medicación, se deriva al Dr. Camino.', 12, true),
  ('paquete_pago', 'Pago del paquete', 'El paquete de 4 sesiones se paga por adelantado.', 13, true),
  ('domicilio', 'Visitas a domicilio', 'No ofrecemos visitas a domicilio. Si alguien lo pregunta, deriva a una persona del equipo.', 14, true)
on conflict (clave) do update set
  titulo = excluded.titulo, contenido = excluded.contenido, orden = excluded.orden, activo = true;
