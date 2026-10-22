-- #85 (22 Oct 2026) — credit cleanup approved line by line by Nicolás.
-- Data-only. Reversible from the *_backup_20261022 copies taken first.
-- No messages to patients. Applied once via the Supabase connector.

-- 0. Backups ------------------------------------------------------------------
create table if not exists public.saldo_lotes_backup_20261022 as table public.saldo_lotes;
create table if not exists public.sessions_backup_20261022 as
  select * from public.sessions where id in (
    'e0484d4e-fcd7-4343-a242-a00b09df5b4a', -- Luis Vaca 2 Oct
    '5e3df344-f14b-4506-80d5-7eae718e651a', -- Emilie Conforme 17 Oct
    '9d848a37-2395-4f07-aebf-22deac170432', -- Zara Basantez 22 Oct
    'd22ad4d3-6fea-477f-b109-8845a853d1f9', -- Karo Merizalde 16 Sep
    'd24f4f32-2cb2-4d0b-ba29-0120194a920d', -- Karo Merizalde 15 Oct
    'cdb9ad8f-d6f5-4895-b825-979c5e409722', -- Shariam A. 14 Oct
    'f342868f-3d99-4b9a-a353-253313607022'  -- Shariam/Marthin 16 Oct
  ) or patient_id = '813f2c7e-7a41-43dd-a5e8-1b733bbb19a0'; -- Martín Torres (all)
create table if not exists public.patients_backup_20261022 as
  select * from public.patients where id in (
    '569453aa-73ff-50b0-86ec-9b86e3d417d3', -- Karo Merizalde
    '813f2c7e-7a41-43dd-a5e8-1b733bbb19a0'  -- Martín Torres
  );
grant select, insert, update, delete on table public.saldo_lotes_backup_20261022 to service_role, authenticated;
grant select, insert, update, delete on table public.sessions_backup_20261022 to service_role, authenticated;
grant select, insert, update, delete on table public.patients_backup_20261022 to service_role, authenticated;

-- A. Duplicates of payments already registered → 0 -----------------------------
update public.saldo_lotes
   set remaining = 0, note = coalesce(note,'') || ' | #85 22 Oct: duplicado de pago ya registrado — Nicolás 22 Oct'
 where id in (
   'bd156563-3a68-4d5c-96b8-f62461cd594f', -- Ericka Rosero $35 (Santiago Maldonado 26 Sep)
   'f04dc25c-ee48-436b-a095-eb2699482ce6', -- Karina Almache old record $35 (Camila 1 Oct)
   '56253128-71ec-4dd4-931c-5a837014236b', -- Nantu Vega $4
   '9fec8015-dd5b-4dff-bd50-32e48e62de6e', -- Raguel lote 03 Oct $36 (Emilie 3 Oct + Raguel 9 Oct)
   '48db0abf-8be3-4e9e-84a3-954f0f0a9e73', -- Shariam A. $76 (14 + 16 Oct)
   '9346be43-c666-43b7-8650-11a39898d9c0'  -- Gabriela Acosta $70 (Martín 2 + 9 Oct)
 );

-- B. Zero + fix session --------------------------------------------------------
-- Luis Vaca: 2 Oct pareja 35 → 50 (stays paid); $15 lote → 0.
update public.sessions set monto = 50 where id = 'e0484d4e-fcd7-4343-a242-a00b09df5b4a' and pagado and monto = 35;
update public.saldo_lotes set remaining = 0,
       note = coalesce(note,'') || ' | #85 22 Oct: $15 = diferencia pareja 2 Oct (monto 35→50) — Nicolás 22 Oct'
 where id = '14db84f9-c1dc-454d-b76e-22068a32167b';

-- Raguel lote 16 Oct $72 ("Emilie y Raguel 17 oct"): Emilie 17 Oct → paid ($36 from it); rest → 0.
insert into public.saldo_consumos (lote_id, session_id, patient_id, amount)
select '60e5eb45-b8f4-4afa-8eaa-e347888281ec', s.id, s.patient_id, 36
  from public.sessions s where s.id = '5e3df344-f14b-4506-80d5-7eae718e651a' and not s.pagado and s.estado = 'confirmada';
update public.sessions set pagado = true, paid_at = now()
 where id = '5e3df344-f14b-4506-80d5-7eae718e651a' and not pagado and estado = 'confirmada';
update public.saldo_lotes set remaining = 0,
       note = coalesce(note,'') || ' | #85 22 Oct: $36 → Emilie 17 Oct; $36 = Raguel 17 Oct ya pagada — Nicolás 22 Oct'
 where id = '60e5eb45-b8f4-4afa-8eaa-e347888281ec';

-- Zara Basantez $32 → her unpaid 22 Oct session.
insert into public.saldo_consumos (lote_id, session_id, patient_id, amount)
select '9c3929c4-cc79-4970-a94d-1b093c060b4f', s.id, s.patient_id, 32
  from public.sessions s where s.id = '9d848a37-2395-4f07-aebf-22deac170432' and not s.pagado and s.monto = 32;
update public.sessions set pagado = true, paid_at = now()
 where id = '9d848a37-2395-4f07-aebf-22deac170432' and not pagado and monto = 32;
update public.saldo_lotes set remaining = 0,
       note = coalesce(note,'') || ' | #85 22 Oct: aplicado a sesión 22 Oct — Nicolás 22 Oct'
 where id = '9c3929c4-cc79-4970-a94d-1b093c060b4f';

-- C. Approve (owner uuid, like #82) — the trigger settles any confirmada+unpaid session.
update public.saldo_lotes
   set aprobado_por = '92ebe5c0-b9e1-49e0-a9b2-a47be4fc6211', aprobado_at = now(),
       note = coalesce(note,'') || ' | aprobado nicolas-85 (22 Oct)'
 where id in (
   'fa29c5a3-123e-4579-987b-45e51283c69e', -- Diana Isabel Marcial Verdesoto $90
   '8c803ca8-38eb-455a-bd73-0b84d4136ccf', -- Fátima Tubon (Valentina) $60
   '374235ba-f475-411e-a908-af21688fe3a4'  -- Natalie Guerrero $25
 ) and aprobado_at is null;

-- D. Forgive and zero ------------------------------------------------------------
update public.saldo_lotes set remaining = 0, note = coalesce(note,'') || ' | #85 22 Oct: condonado — Nicolás 22 Oct'
 where id in (
   '46b237e5-c4f1-4f06-9566-63d416c9848a', -- Luna Guamán $1
   '7f2d0bdd-3065-47d0-9589-1bf2f43d1796', -- Valentina Andrade $1
   '6e68675e-26fa-4bb9-bf7e-9774cfe558bd'  -- Shariam (Marthin) $1
 );
-- Shariam's $2 short on 14 + 16 Oct: both sessions are already pagado=true → nothing owed; no change.

-- E. Karo Merizalde: tarifa 39 → 35 ------------------------------------------------
update public.saldo_lotes set remaining = 0,
       note = coalesce(note,'') || ' | #85 22 Oct: pagó la sesión 16 Sep (monto 39→35) — Nicolás 22 Oct'
 where id = 'a4c09041-1889-48b5-a7d9-af4c683f281d';
update public.patients set tarifa = 35 where id = '569453aa-73ff-50b0-86ec-9b86e3d417d3' and tarifa = 39;
update public.sessions set monto = 35 where id = 'd22ad4d3-6fea-477f-b109-8845a853d1f9' and pagado and monto = 39;
update public.sessions set monto = 35 where id = 'd24f4f32-2cb2-4d0b-ba29-0120194a920d' and not pagado and monto = 39;

-- F. Gabriela Acosta = payer of Martín Torres (#61) -----------------------------------
insert into public.payers (nombre, apellido, telefono, email)
select 'Gabriela', 'Acosta', '+593998179787', 'gabyacosta81b@hotmail.com'
 where not exists (select 1 from public.payers where telefono = '+593998179787');
update public.patients set payer_id = (select id from public.payers where telefono = '+593998179787')
 where id = '813f2c7e-7a41-43dd-a5e8-1b733bbb19a0' and payer_id is null;

-- G. Mariana's forwarded receipts ------------------------------------------------------
-- $35 05 Oct (Betancourt Luzon David Danilo, ref 199192280): same transfer already applied
-- 7 Oct (whatsapp_messages 9bab1b96…) to David Betancourt's 3 Oct session → duplicate.
update public.saldo_lotes set remaining = 0,
       note = coalesce(note,'') || ' | #85 22 Oct: duplicado — ref 199192280 ya aplicada a David Betancourt 3 Oct — Nicolás 22 Oct'
 where id = 'a540af30-bff4-4b0d-b01e-47c256283665';
-- Left for Nicolás: $30 13 Oct (payphone, no name), $36 17 Oct (Daniela Santillan; her 17 Oct is $39),
-- $35 19 Oct (Karo Merizalde; would pay her 15 Oct, but E says it stays unpaid).
