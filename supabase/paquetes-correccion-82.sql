-- #82 (2026-10-21) — correct the damage from the package bug ($39 drawn per session instead of $35).
-- Applied via the Supabase connector: migration `paquetes_correccion_82` (backups + trigger) and the
-- data block below (guarded on the CURRENT values, so re-running is a no-op).
--
-- Evidence per lote (see EFIMERAMENTE_STATE.md #82): sessions each package covered were rebuilt from
-- the lote's creation / backfill anchor, the receipt that created it (reconciled_session_ids) and
-- paid_at timing. Correct remaining = amount − price_per_session × non-cancelled sessions covered (≤4).
--   Andrea Torres      f0b7af8c  23 → 70   (23 Sep + 1 Oct; the $39 a cancelled 7/8 Oct session drew is returned)
--   Catalina Fernández b8eea29a 101 → 105  (8 Oct)
--   Emily Rivera (2nd) fc6ce9f9 136 → 140  (her 10 Oct session was the 4th of the 1st package, not this one)
--   Juan Carlos Carrera 5a28243c 62 → 70   (1 Oct + 15 Oct)
--   Ramesvary Henao    b21fac31  31 → 35   (31 Aug + 16 Sep + 17 Oct)
--   Unchanged & correct: Daniel Granja 35, Samantha Aldaz 48 @24, Emily (1st) 0, Gabriela Páliz 0,
--   Isabel Garcés 0, Shyam Yelpi 0. Fátima Tubón 60 @30 = UNCLEAR (8 + 16 Oct both marked paid by hand
--   13 Oct; only one $30 left the lote) → not touched, not approved; Nicolás decides.
-- Sessions a package paid get monto = the package price ($35) — none were invoiced yet.
-- Corrected + verified-correct package lotes with credit left are approved (aprobado_por = Nicolás's
-- profile id; aprobado_por is a uuid, so "nicolas-82" goes in the note) so they keep paying under #81 C.

-- ── 0. Backups ───────────────────────────────────────────────────────────────
create table if not exists public.saldo_lotes_backup_20261021 as table public.saldo_lotes;
create table if not exists public.sessions_backup_20261021 as
  select * from public.sessions where patient_id in (select patient_id from public.saldo_lotes where origin = 'package');
alter table public.saldo_lotes_backup_20261021 enable row level security;
alter table public.sessions_backup_20261021 enable row level security;
drop policy if exists saldo_lotes_backup_20261021_owner on public.saldo_lotes_backup_20261021;
create policy saldo_lotes_backup_20261021_owner on public.saldo_lotes_backup_20261021 for all
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists sessions_backup_20261021_owner on public.sessions_backup_20261021;
create policy sessions_backup_20261021_owner on public.sessions_backup_20261021 for all
  using (public.is_owner()) with check (public.is_owner());
grant select, insert, update, delete on table public.saldo_lotes_backup_20261021 to service_role, authenticated;
grant select, insert, update, delete on table public.sessions_backup_20261021 to service_role, authenticated;

-- ── Going forward: a session paid from a PACKAGE shows the package price ─────
-- (same function as saldo-precio-paquete-81.sql + the monto line in the unit branch)
create or replace function public.consume_saldo_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_need numeric(10,2);
  v_credit numeric(10,2);
  r record;
  v_take numeric(10,2);
  v_unit record;
begin
  if tg_op = 'UPDATE' and new.estado = 'cancelada' and old.estado is distinct from 'cancelada' then
    for r in
      select id, lote_id, amount from public.saldo_consumos
      where session_id = new.id and revertido_at is null
      for update
    loop
      update public.saldo_lotes set remaining = round(remaining + r.amount, 2) where id = r.lote_id;
      update public.saldo_consumos set revertido_at = now() where id = r.id;
    end loop;
    return new;
  end if;

  if new.estado is distinct from 'confirmada'
     or coalesce(new.pagado, false)
     or new.tipo = 'llamada'
     or coalesce(new.monto, 0) <= 0 then
    return new;
  end if;

  select id, price_per_session, origin into v_unit
  from public.saldo_lotes
  where patient_id = new.patient_id
    and aprobado_at is not null
    and price_per_session > 0
    and remaining + 0.005 >= price_per_session
  order by created_at, id
  limit 1
  for update;

  if found then
    update public.saldo_lotes set remaining = round(remaining - v_unit.price_per_session, 2) where id = v_unit.id;
    insert into public.saldo_consumos (lote_id, session_id, patient_id, amount)
    values (v_unit.id, new.id, new.patient_id, v_unit.price_per_session);
    if v_unit.origin = 'package' then
      new.monto := v_unit.price_per_session;   -- #82: a package session is worth the package price
    end if;
    new.pagado := true;
    new.paid_at := now();
    return new;
  end if;

  select coalesce(sum(remaining), 0) into v_credit
  from public.saldo_lotes
  where patient_id = new.patient_id and remaining > 0
    and aprobado_at is not null and origin <> 'package';

  v_need := new.monto;
  if v_credit + 0.005 < v_need then
    return new;
  end if;

  for r in
    select id, remaining from public.saldo_lotes
    where patient_id = new.patient_id and remaining > 0
      and aprobado_at is not null and origin <> 'package'
    order by created_at, id
    for update
  loop
    exit when v_need <= 0.005;
    v_take := least(r.remaining, v_need);
    update public.saldo_lotes set remaining = round(remaining - v_take, 2) where id = r.id;
    insert into public.saldo_consumos (lote_id, session_id, patient_id, amount)
    values (r.id, new.id, new.patient_id, v_take);
    v_need := round(v_need - v_take, 2);
  end loop;

  new.pagado := true;
  new.paid_at := now();
  return new;
end;
$function$;
alter function public.consume_saldo_on_confirm() owner to postgres;

-- ── 1+5. Corrected remaining (guarded on the current value) ──────────────────
update public.saldo_lotes set remaining = 70,  note = note || ' | #82 21 Oct: 23→70 (2 sesiones @35; devuelto el $39 de una sesión cancelada)' where id = 'f0b7af8c-3e06-4a71-8270-f26824c9cf54' and remaining = 23;
update public.saldo_lotes set remaining = 105, note = note || ' | #82 21 Oct: 101→105 (8 oct @35)'                         where id = 'b8eea29a-32ed-4f49-ba70-f9093f89d147' and remaining = 101;
update public.saldo_lotes set remaining = 140, note = note || ' | #82 21 Oct: 136→140 (10 oct era del 1er paquete)'        where id = 'fc6ce9f9-ed07-47ce-b556-aa68ddd8b222' and remaining = 136;
update public.saldo_lotes set remaining = 70,  note = note || ' | #82 21 Oct: 62→70 (1 + 15 oct @35)'                      where id = '5a28243c-a0bf-4a4a-8c1b-b0d1262d85cb' and remaining = 62;
update public.saldo_lotes set remaining = 35,  note = note || ' | #82 21 Oct: 31→35 (31 ago + 16 sep + 17 oct @35)'        where id = 'b21fac31-2937-4a8c-a591-b7ff9f592617' and remaining = 31;

-- ── 2. Package sessions at the package price (none invoiced) ──────────────────
update public.sessions set monto = 35
where monto = 39 and coalesce(facturada, false) = false and contifico_doc_id is null
  and id in ('0720db10-27fe-4370-b2c6-fe8692a3a9df', '89338148-1eb7-42ca-b196-5cbf1ab8f9be',   -- Andrea 23 Sep, 1 Oct
             '16af38fd-b843-4789-9da3-233ba32127e2',                                            -- Catalina 8 Oct
             'a0c67c60-4811-49a2-b1db-06f5194b6075', '044544e4-862d-4257-9a16-aa049054f82e',    -- Emily 15 Aug, 14 Sep
             '29bbc542-396c-4012-b86d-886e2ceadc74',                                            -- Emily 10 Oct
             '34dde2f1-7a39-4f59-8399-d169c5de0b63', 'e809b9b7-ebcd-497f-8e97-27752d63146b',    -- Juan Carlos 1 + 15 Oct
             'bf0cf719-9438-43c2-b94e-5fedeff1e740');                                           -- Ramesvary 17 Oct

-- ── 5. Approve the verified package lotes that still hold credit ──────────────
update public.saldo_lotes
set aprobado_por = '92ebe5c0-b9e1-49e0-a9b2-a47be4fc6211', aprobado_at = now(),
    note = note || ' | aprobado nicolas-82 (21 Oct)'
where aprobado_at is null and id in (
  'f0b7af8c-3e06-4a71-8270-f26824c9cf54', 'b8eea29a-32ed-4f49-ba70-f9093f89d147', 'fc6ce9f9-ed07-47ce-b556-aa68ddd8b222',
  '5a28243c-a0bf-4a4a-8c1b-b0d1262d85cb', 'b21fac31-2937-4a8c-a591-b7ff9f592617',
  '35a33bcc-e3e6-466d-9dd5-6afa6ed4bcfc', '5ce40b56-5419-4b8d-adb1-154b1243a35c');   -- + Daniel Granja, Samantha Aldaz (verified correct)
