-- 2026-10-02 — Optional per-patient override for the name printed in a factura's
-- Observaciones ("Paciente {nombre_factura} | …"). NULL = default display name
-- (the minor for a `menor`, else the patient). Needed when two patients share one
-- payer and must stay distinguishable on the invoice, e.g. Cecilia Saltos (mother)
-- and Valentina Loor (daughter), both billed to Dorian Solis. Read by
-- netlify/functions/facturar.mjs#patientDisplayName.
alter table patients add column if not exists nombre_factura text;
