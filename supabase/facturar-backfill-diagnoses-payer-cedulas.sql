-- Backfill for the API /facturar rewrite (applied 2026-09-23 to vnityzpuhnkumsyfnskz).
-- Master data gathered in the 2026-09-23 Contífico recon, confirmed by Nicolás.
-- NOT retroactive session data — these fill patient/payer records so FUTURE
-- sessions (from the FACTURAR_SINCE floor onward) are invoiceable.
--
-- Also fixes a missing GRANT: `payers` was created via raw apply_migration and
-- never inherited Supabase's default table grants, so the service-role reader in
-- netlify/functions/facturar.mjs hit 42501 permission denied.

grant select, insert, update, delete on public.payers to service_role, authenticated, anon;

-- Diagnoses (CIE-10 code + text) recovered from each patient's past invoices.
update patients set diagnostico_codigo='F41',   diagnostico_texto='otros trastornos de ansiedad'                    where id='c0cfefae-961c-5575-a9ac-92aeda99cfa8'; -- Laura Vasquez
update patients set diagnostico_codigo='F88',   diagnostico_texto='Otros trastornos del desarrollo psicológico'     where id='6ab917e2-2b3c-5328-8cb4-aa04d8a55caa'; -- Emilie Conforme
update patients set diagnostico_codigo='F88',   diagnostico_texto='Otros trastornos del desarrollo psicológico'     where id='f2a17a5d-153e-56be-9adf-ac12f9936b6a'; -- Raguel Conforme
update patients set diagnostico_codigo='F41.1', diagnostico_texto='Trastorno de Ansiedad Generalizada'              where id='7c7aa18a-bfe6-443d-b211-73c1b167e3b7'; -- Micaela Castro
update patients set diagnostico_codigo='F41.8', diagnostico_texto='Otro Trastorno de Ansiedad Social Especificado'  where id='9d860eb7-0f04-4dc5-a93d-cd0011c1ac46'; -- Thomas Quevedo
-- Marthin Spatz (menor): invoices say "Trastorno de Adaptación", no numeric F-code.
update patients set diagnostico_codigo=null,    diagnostico_texto='Trastorno de Adaptación'                         where id='6f9b2b87-54c0-4b80-af10-a84cd096a833'; -- Sharian Narvaez / Marthin Spatz

-- Payer own cédulas (= Contífico persona key). Personas already exist in Contífico.
update payers set cedula='1716794209', contifico_id='1716794209' where id='98344a80-5e5a-46eb-8206-73be046b4664'; -- Germania Domínguez
update payers set cedula='1716725765', contifico_id='1716725765' where id='d59610a6-e693-4269-914b-61ab914f8db8'; -- Gabriela Páliz
update payers set cedula='1712067378', contifico_id='1712067378' where id='d7af743c-0c5e-463f-8298-c681e1d3d4af'; -- Washington Andrade

-- STILL BLOCKED after this backfill (need Nicolás to supply):
--   Valentina Andrade — no diagnosis on any past invoice.
--   Andrés Gotta — no cédula (own null, no payer) AND no diagnosis.
