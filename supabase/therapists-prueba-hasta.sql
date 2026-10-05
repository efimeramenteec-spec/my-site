-- #48 — Trial period (2026-10-05). ADDITIVE.
-- New therapists are paid $20 per non-pareja session (PROVISION_PRUEBA in
-- src/lib/provision.js) for sessions dated <= prueba_hasta. null = no trial.
alter table therapists add column if not exists prueba_hasta date;
update therapists set prueba_hasta = '2026-10-31' where nombre = 'Sophia' and apellido = 'Vergara';
