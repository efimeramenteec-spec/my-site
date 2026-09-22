-- Payers + patient billing foundation.
-- Mirrors migration `payers_and_patient_billing` (applied 2026-09-22 to vnityzpuhnkumsyfnskz).
--
-- WHY: an invoice (factura SRI) is issued to a *billing entity* that is not always
-- the patient. Some patients are minors or covered by a relative, so the factura
-- must go to that payer's name/cédula, and payment proofs (comprobantes) arrive
-- from the PAYER's WhatsApp number — hence telefono lives on the payer.
--
-- MODEL: patients.payer_id -> payers.id, NULLABLE. NULL = the patient pays for
-- themselves (true for ~95%). A non-null payer_id means the linked payers row is
-- the billing entity.

-- 1) payers — the billing entity an invoice is issued to.
create table if not exists payers (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  apellido     text,
  cedula       text,
  contifico_id text,
  email        text,
  telefono     text,          -- comprobantes arrive from the payer's WhatsApp number
  razon_social text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- 2) patients billing columns (all additive, all nullable/defaulted).
alter table patients add column if not exists payer_id uuid references payers(id);
-- facturacion_obligatoria: this patient REQUIRES an SRI factura. Distinct from —
-- and MUST NOT be confused with — facturacion_manual, which means "never
-- auto-invoice". They are not opposites of the same flag; both may coexist.
alter table patients add column if not exists facturacion_obligatoria boolean not null default false;
-- Clinical category. Label in the UI explicitly asks for the CIE-10 code so
-- therapists know a clinical category is expected. Never required.
alter table patients add column if not exists diagnostico_codigo text;
alter table patients add column if not exists diagnostico_texto  text;

-- 3) RLS — owner-only. Payers are billing data managed by the owner; therapists
--    do not create or edit payer records.
alter table payers enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='payers' and policyname='payers_owner') then
    create policy payers_owner on payers for all using (is_owner()) with check (is_owner());
  end if;
end $$;

-- ── Seed data (run once, 2026-09-22) ────────────────────────────────────────
-- 4 payers + links + surname cleanup + facturacion_obligatoria for the 10 that
-- require invoicing. Relationships were previously faked in patients.apellido as
-- parenthetical free text (e.g. "(Germania Dominguez)"); cleaned once linked.
--
-- insert into payers (nombre, apellido, cedula, contifico_id, email, telefono) values
--   ('Laura','Vásquez','1718240995001','1718240995','davisun18@gmail.com','+593999643019'),
--   ('Germania','Domínguez',null,null,'germy_dominguez@hotmail.com','+593963010607'),
--   ('Gabriela','Páliz',null,null,'gabriela.c.paliz@gsk.com','+593980353111'),
--   ('Washington','Andrade',null,null,null,'+593992738962');
-- Laura Vásquez covers herself + Raguel Conforme + Emilie Conforme.
-- Germania Domínguez covers Micaela Castro (name cleaned "Micaela Castro"/"(Germania Dominguez)" -> "Micaela"/"Castro").
-- Gabriela Páliz covers Thomas (surname set to "Quevedo").
-- Washington Andrade covers Valentina Andrade.
-- facturacion_obligatoria=true: Emiliano Caradonna, Laura Vásquez, Raguel Conforme,
--   Emilie Conforme, Sharian Narváez, Cinthya Pérez, Valentina Andrade, Andrés Gotta,
--   Micaela Castro, Thomas Quevedo.
