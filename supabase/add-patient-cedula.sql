-- Billing groundwork for the Contífico invoicing protocols (2026-07-09).
-- Applied via the Supabase connector (migration `add_patient_cedula_contifico`).
--
-- cedula:       buyer identification required by SRI to issue a factura. Enforced as a
--               required field in the UI for NEW patients; kept nullable in the DB so
--               historical rows and edge cases (guardian-shared IDs, foreigners) don't
--               break inserts.
-- contifico_id: stamped by Protocol 1 ("create client in Contífico"). Protocol 2
--               ("invoicing") requires it — a NULL means the client does not exist in
--               Contífico yet and must be created first.
alter table public.patients add column if not exists cedula text;
alter table public.patients add column if not exists contifico_id text;
