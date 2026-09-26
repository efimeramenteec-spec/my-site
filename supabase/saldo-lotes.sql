-- saldo-lotes.sql
--
-- #19 Saldo a favor — credit "lotes" (batches) + FIFO consumption. Replaces the
-- package_anchor prepay checkbox. Covers 4-session packages, paying 2–3 sessions
-- upfront, prepaying one session, and (later) odd overpayments. Every payment that
-- leaves credit creates a lote; consumption is FIFO (oldest lote first) at the
-- LOTE's price_per_session (not the patient's tarifa). Shared math in
-- netlify/lib/saldo.mjs.
--
-- APPLIED 2026-09-26 via the Supabase connector:
--   • migration `saldo_lotes_table_and_trigger` (table + trigger below)
--   • backfill insert (7 live-credit lotes, $433 — the INSERT at the bottom)
--
-- NOT done (deliberately): comprobante→lote creation ($140 package / overpayment
-- surplus) and comprobante/reminder net-of-credit — only needed once non-package
-- (odd-amount) lotes exist; package lotes are whole multiples so the trigger fully
-- covers them. And the destructive DROP of sessions.package_anchor stays pending
-- explicit approval (the column + ★ display are still read elsewhere).
--
-- Depends on: payers (payers-and-patient-billing.sql) + is_owner() (auth-setup.sql).

-- ── Table ────────────────────────────────────────────────────────────────────
create table if not exists public.saldo_lotes (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid not null references public.patients(id) on delete cascade,
  payer_id          uuid references public.payers(id) on delete set null,  -- denormalized owner (= patients.payer_id) for future payer-group scoping
  amount            numeric(10,2) not null,           -- total credit this payment created
  price_per_session numeric(10,2) not null,           -- consumption rate ($35 for a standard package)
  remaining         numeric(10,2) not null,           -- credit left; FIFO oldest-first; 0 = spent
  origin            text not null default 'package'
                      check (origin in ('package','overpayment','prepay','manual')),
  source_session_id uuid references public.sessions(id) on delete set null,          -- anchor (backfill) / triggering session
  proof_id          uuid references public.whatsapp_messages(id) on delete set null, -- comprobante that created it (overpayment)
  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists saldo_lotes_open_idx
  on public.saldo_lotes (patient_id, created_at) where remaining > 0;

alter table public.saldo_lotes enable row level security;
drop policy if exists saldo_lotes_owner on public.saldo_lotes;
create policy saldo_lotes_owner on public.saldo_lotes for all
  using (public.is_owner()) with check (public.is_owner());
-- Explicit GRANTs — a table made via apply_migration does NOT inherit the default
-- role grants (the whatsapp-delivery-status gotcha: service-role hit 42501).
grant select, insert, update, delete on public.saldo_lotes to service_role, authenticated;

-- ── Consumption trigger ──────────────────────────────────────────────────────
-- On a confirmada + unpaid + billable session, draw the patient's credit FIFO
-- (oldest lote first). FULL-COVERAGE ONLY: package lotes always cover whole
-- sessions, so partial draws never happen; if credit can't cover the whole session
-- it's left unpaid for the reminder/comprobante flow. Fires from every write path
-- (app, webhook, SQL). Reversible: flip pagado + restore remaining.
create or replace function public.consume_saldo_on_confirm()
returns trigger language plpgsql as $$
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
$$;

drop trigger if exists consume_saldo_on_confirm on public.sessions;
create trigger consume_saldo_on_confirm
before insert or update on public.sessions
for each row execute function public.consume_saldo_on_confirm();

-- ── Backfill (applied 2026-09-26; reviewed with Nicolás) ──────────────────────
-- One lote per package_anchor pack with UNCONSUMED credit (< 4 PAID pack sessions).
-- remaining = price_per_session × (4 − paid pack sessions). Fully-paid packs get no
-- lote. Standard rate $35; Samantha Aldaz at her real special $24 (pack 4×$24=$96).
-- Micaela Castro dropped (balance $0; since re-typed as a menor). 7 lotes, $433.
--
-- insert into public.saldo_lotes (patient_id, payer_id, amount, price_per_session, remaining, origin, source_session_id, note)
-- select s.patient_id, p.payer_id, x.amount, x.rate, x.remaining, 'package', x.anchor_session_id, x.note
-- from (values
--   ('ca569ad7-7fc8-4c8c-85bd-6abe1f8819ff'::uuid, 140::numeric, 35::numeric, 35::numeric,  'Backfill package_anchor — 3/4 pagadas al 2026-09-26'),   -- Daniel Granja
--   ('a0c67c60-4811-49a2-b1db-06f5194b6075'::uuid, 140, 35, 35,  'Backfill package_anchor — 3/4 pagadas al 2026-09-26'),   -- Emily Rivera
--   ('60011384-e17b-4e2b-8e06-05772bcecd89'::uuid, 140, 35, 70,  'Backfill package_anchor — 2/4 pagadas al 2026-09-26'),   -- Isabel Garcés
--   ('4c68ebdc-10ce-43da-a742-73ae16a17376'::uuid, 140, 35, 105, 'Backfill package_anchor — 1/4 pagadas al 2026-09-26'),   -- Ramesvary Henao
--   ('20351855-bafe-4a3f-b7e7-b21b74490992'::uuid, 96,  24, 48,  'Backfill package_anchor — 2/4 pagadas al 2026-09-26 (tarifa especial $24)'), -- Samantha Aldaz
--   ('c94ea66d-5328-4655-b298-3126357bb007'::uuid, 140, 35, 105, 'Backfill package_anchor — 1/4 pagadas al 2026-09-26'),   -- Shyam Yelpi
--   ('56625b85-8d9b-4b02-b44a-23f499dcd9c2'::uuid, 140, 35, 35,  'Backfill package_anchor — 3/4 pagadas al 2026-09-26')    -- Thomas Quevedo (menor)
-- ) as x(anchor_session_id, amount, rate, remaining, note)
-- join public.sessions s on s.id = x.anchor_session_id
-- join public.patients p on p.id = s.patient_id;

-- ── FOLLOW-UP — ALL SHIPPED 2026-09-25 (commit 5ee272e + drop migration) ───────
--   1. ✅ proofReconcile: $140 comprobante → package lote (then settles pooled credit);
--      matched-sender overpayment surplus → 'overpayment' lote; no-debt → 'prepay' lote;
--      matches against amount-net-of-credit + consumes credit on match.
--   2. ✅ paymentReminders: asks amount net of credit; fully-covered patients not reminded.
--   3. ✅ package_anchor DROPPED — see supabase/drop-sessions-package-anchor.sql.
-- NOTE: the confirm trigger + proofReconcile settle are POOL-based (they draw the
-- session's monto from total remaining credit); price_per_session is nominal accounting,
-- not a per-session cap. So a $140 package pool covers ~$140 of sessions at their real
-- monto, not necessarily exactly 4 sessions when tarifa ≠ $35.
