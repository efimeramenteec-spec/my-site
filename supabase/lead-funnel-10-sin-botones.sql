-- supabase/lead-funnel-10-sin-botones.sql
-- #54 — lead bot without buttons + booking link (2026-10-06).
-- Additive: the therapist ids shown on the last card set, so the classifier can
-- resolve "me gustaría con francisco" against what the lead is looking at.
alter table leads add column if not exists cards_ofrecidas uuid[];

-- Data (row updates, approved plan of 6 Oct):
-- Camila out of couples therapy — Carolina is the only couples therapist.
update funnel_categorias
   set terapeutas = array['48a4a020-8ab4-5e11-89ed-17a1e1713b54']::uuid[]
 where clave = 'terapia_pareja';
-- The fact sheet no longer talks about buttons.
update funnel_knowledge
   set contenido = 'La persona elige a su terapeuta en este chat y luego agenda la llamada en el link, en el día y hora que prefiera.'
 where clave = 'agenda';
