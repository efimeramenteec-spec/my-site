-- #81 B + C (2026-10-21) — package credit is spent at the PACKAGE price, cancelled sessions
-- never keep a draw, and ONLY APPROVED credit is ever spent automatically.
-- Migration name: saldo_precio_paquete_81   (applied via the Supabase connector)
--
-- B. consume_saldo_on_confirm draws ONE UNIT = the lote's price_per_session (e.g. $35 from a
--    $140 package for a $39 session), from the oldest eligible lote that still holds a full
--    unit → a package lote covers exactly amount / price_per_session sessions (4 for a package).
--    Fallback (fragments only): non-package lotes pooled FIFO for the session's monto, as
--    before. Package lotes are never pooled or split.
--    Every draw is logged in saldo_consumos (lote, session, amount). When a session becomes
--    'cancelada', its live draws are returned to their lotes (revertido_at) — a cancelled
--    session never keeps credit. (Draws made before this migration were never logged, so
--    they can't be returned automatically — the #81 report lists them for Nicolás.)
-- C. Eligible lote = remaining > 0 AND aprobado_at IS NOT NULL (Nicolás approved it, or the
--    #80 4 × tarifa rule stamped it). Everything else stays untouched until approved.
--    Approving a lote (aprobado_at null → set) settles the patient's confirmada + unpaid
--    sessions right away, through the same trigger.
-- apply_new_saldo_lote no longer has its own copy of the draw: it "touches" each confirmada +
-- unpaid session (oldest first) so consume_saldo_on_confirm does the draw; stops at the first
-- session the credit can't cover.

-- ── Draw log ──────────────────────────────────────────────────────────────────
create table if not exists public.saldo_consumos (
  id            uuid primary key default gen_random_uuid(),
  lote_id       uuid not null references public.saldo_lotes(id) on delete cascade,
  session_id    uuid not null,              -- no FK: written from a BEFORE INSERT trigger
  patient_id    uuid not null,
  amount        numeric(10,2) not null,
  created_at    timestamptz not null default now(),
  revertido_at  timestamptz                 -- set when the session was cancelled and the amount returned
);
create index if not exists saldo_consumos_session_idx on public.saldo_consumos (session_id) where revertido_at is null;
create index if not exists saldo_consumos_lote_idx on public.saldo_consumos (lote_id);
alter table public.saldo_consumos enable row level security;
drop policy if exists saldo_consumos_owner on public.saldo_consumos;
create policy saldo_consumos_owner on public.saldo_consumos for all
  using (public.is_owner()) with check (public.is_owner());
grant select, insert, update, delete on table public.saldo_consumos to service_role, authenticated;

-- ── Confirm → draw (B + C) / cancel → refund ─────────────────────────────────
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
  -- Cancelled → give back whatever this session drew (logged draws only).
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

  -- (1) One unit at the lote's own price, oldest approved lote holding a full unit.
  select id, price_per_session into v_unit
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
    new.pagado := true;
    new.paid_at := now();
    return new;
  end if;

  -- (2) Fragments: approved NON-package lotes pooled FIFO for the session's monto.
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

-- ── New / newly-approved credit pays existing debt (through the trigger above) ──
create or replace function public.settle_saldo_for_patient(p_patient uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  s record;
  v_paid boolean;
begin
  for s in
    select id from public.sessions
    where patient_id = p_patient
      and estado = 'confirmada'
      and not coalesce(pagado, false)
      and tipo is distinct from 'llamada'
      and coalesce(monto, 0) > 0
    order by fecha, hora_inicio nulls last, id
  loop
    update public.sessions set estado = estado where id = s.id;   -- fires consume_saldo_on_confirm
    select pagado into v_paid from public.sessions where id = s.id;
    exit when not coalesce(v_paid, false);
  end loop;
end;
$function$;
alter function public.settle_saldo_for_patient(uuid) owner to postgres;
revoke all on function public.settle_saldo_for_patient(uuid) from public, anon, authenticated;

create or replace function public.apply_new_saldo_lote()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  -- Receipt lotes are settled by proofReconcile.applyPlan itself (double-draw guard).
  if new.patient_id is null or coalesce(new.remaining, 0) <= 0 or new.aprobado_at is null then
    return null;
  end if;
  if tg_op = 'INSERT' and new.proof_id is not null then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.aprobado_at is not null then
    return null;
  end if;
  perform public.settle_saldo_for_patient(new.patient_id);
  return null;
end;
$function$;
alter function public.apply_new_saldo_lote() owner to postgres;

drop trigger if exists apply_new_saldo_lote on public.saldo_lotes;
create trigger apply_new_saldo_lote
  after insert on public.saldo_lotes
  for each row execute function public.apply_new_saldo_lote();

drop trigger if exists apply_approved_saldo_lote on public.saldo_lotes;
create trigger apply_approved_saldo_lote
  after update of aprobado_at on public.saldo_lotes
  for each row execute function public.apply_new_saldo_lote();
