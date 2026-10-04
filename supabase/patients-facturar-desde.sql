-- #44 (2026-10-04): per-patient invoicing floor. NULL = the global FACTURAR_SINCE
-- (netlify/lib/facturarCore.mjs). Set only to back-invoice a patient's paid sessions
-- from an earlier date (María Emilia Worm → 2026-09-01). Additive, nullable.
alter table public.patients add column if not exists facturar_desde date;
