-- #88 (Nicolás, 23 Oct 2026): a lote can be limited to sessions ON OR AFTER a date.
-- saldo_lotes.valido_desde (date, nullable; null = any session, as before).
-- consume_saldo_on_confirm skips a lote whose valido_desde is after the session's
-- fecha — so a prepay for FUTURE sessions never pays an older owed one (Laura Galindo:
-- $60 prepay must not pay her 9 Oct session). JS mirror: saldo.mjs#owedAfterCredit.
-- Additive: existing lotes keep valido_desde null → behaviour unchanged.

alter table public.saldo_lotes add column if not exists valido_desde date;

create or replace function public.consume_saldo_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
    and (valido_desde is null or new.fecha >= valido_desde)
  order by created_at, id
  limit 1
  for update;

  if found then
    update public.saldo_lotes set remaining = round(remaining - v_unit.price_per_session, 2) where id = v_unit.id;
    insert into public.saldo_consumos (lote_id, session_id, patient_id, amount)
    values (v_unit.id, new.id, new.patient_id, v_unit.price_per_session);
    if v_unit.origin = 'package' then
      new.monto := v_unit.price_per_session;
    end if;
    new.pagado := true;
    new.paid_at := now();
    return new;
  end if;

  select coalesce(sum(remaining), 0) into v_credit
  from public.saldo_lotes
  where patient_id = new.patient_id and remaining > 0
    and aprobado_at is not null and origin <> 'package'
    and (valido_desde is null or new.fecha >= valido_desde);

  v_need := new.monto;
  if v_credit + 0.005 < v_need then
    return new;
  end if;

  for r in
    select id, remaining from public.saldo_lotes
    where patient_id = new.patient_id and remaining > 0
      and aprobado_at is not null and origin <> 'package'
      and (valido_desde is null or new.fecha >= valido_desde)
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
$$;
