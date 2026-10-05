-- #49b (2026-10-05) — package credit is consumed whoever confirms + new credit pays existing debt.
-- Migration name: saldo_consume_security_definer
--
-- (a) consume_saldo_on_confirm() ran with the CONFIRMING user's rights. saldo_lotes RLS is
--     owner-only, so a therapist confirming in the app saw $0 credit and the trigger skipped
--     silently. Now SECURITY DEFINER (owner postgres, pinned search_path). Logic unchanged.
--     RLS on saldo_lotes is NOT widened — therapists still can't read it.
-- (b) AFTER INSERT on saldo_lotes: a new lote immediately pays the patient's confirmada +
--     unpaid + non-llamada sessions, oldest fecha first, full coverage only (same FIFO draw
--     as (a)); stops at the first session the open credit can't fully cover.
--     GUARD: lotes with proof_id are skipped. The comprobante path (proofReconcile.mjs
--     applyPlan) inserts its lote FIRST and then draws credit + marks its own sessions —
--     settling here too would double-consume. Only manual inserts (e.g. #51) reach (b).
--     Marking paid here fires only the existing sessions triggers (lead_link_from_session);
--     notify-estado is client-called, payment reminders just skip paid rows.

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
begin
  if new.estado is distinct from 'confirmada'
     or coalesce(new.pagado, false)
     or new.tipo = 'llamada'
     or coalesce(new.monto, 0) <= 0 then
    return new;
  end if;

  select coalesce(sum(remaining), 0) into v_credit
  from public.saldo_lotes
  where patient_id = new.patient_id and remaining > 0;

  v_need := new.monto;
  if v_credit + 0.005 < v_need then
    return new;
  end if;

  for r in
    select id, remaining from public.saldo_lotes
    where patient_id = new.patient_id and remaining > 0
    order by created_at, id
    for update
  loop
    exit when v_need <= 0.005;
    v_take := least(r.remaining, v_need);
    update public.saldo_lotes set remaining = round(remaining - v_take, 2) where id = r.id;
    v_need := round(v_need - v_take, 2);
  end loop;

  new.pagado := true;
  new.paid_at := now();
  return new;
end;
$function$;

alter function public.consume_saldo_on_confirm() owner to postgres;

create or replace function public.apply_new_saldo_lote()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  s record;
  r record;
  v_credit numeric(10,2);
  v_need numeric(10,2);
  v_take numeric(10,2);
begin
  if new.proof_id is not null or new.patient_id is null or coalesce(new.remaining, 0) <= 0 then
    return null;
  end if;

  for s in
    select id, monto from public.sessions
    where patient_id = new.patient_id
      and estado = 'confirmada'
      and not coalesce(pagado, false)
      and tipo is distinct from 'llamada'
      and coalesce(monto, 0) > 0
    order by fecha, hora_inicio nulls last, id
    for update
  loop
    select coalesce(sum(remaining), 0) into v_credit
    from public.saldo_lotes
    where patient_id = new.patient_id and remaining > 0;

    exit when v_credit + 0.005 < s.monto;

    v_need := s.monto;
    for r in
      select id, remaining from public.saldo_lotes
      where patient_id = new.patient_id and remaining > 0
      order by created_at, id
      for update
    loop
      exit when v_need <= 0.005;
      v_take := least(r.remaining, v_need);
      update public.saldo_lotes set remaining = round(remaining - v_take, 2) where id = r.id;
      v_need := round(v_need - v_take, 2);
    end loop;

    update public.sessions set pagado = true, paid_at = now() where id = s.id;
  end loop;

  return null;
end;
$function$;

alter function public.apply_new_saldo_lote() owner to postgres;

drop trigger if exists apply_new_saldo_lote on public.saldo_lotes;
create trigger apply_new_saldo_lote
  after insert on public.saldo_lotes
  for each row execute function public.apply_new_saldo_lote();
