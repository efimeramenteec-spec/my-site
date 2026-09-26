-- saldo-lotes.sql
--
-- #19 Saldo a favor — credit "lotes" (batches). Replaces the package_anchor checkbox.
-- Covers: 4-session packages, paying 2–3 sessions upfront, prepaying one session, and
-- odd overpayments. Every payment that leaves credit creates a lote; consumption is
-- FIFO (oldest lote first) at the LOTE's price_per_session (not the patient's tarifa).
-- A package is always $140 for 4 → a lote at $35/session (netlify/lib/saldo.mjs).
--
-- STATUS: **NOT YET APPLIED.** The CREATE TABLE is additive/safe; the BACKFILL creates
-- financial rows, so it waits on Nicolás's review of the dry-run (2026-09-26). Apply
-- the table + the confirmed backfill together via the Supabase connector once approved.
--
-- Depends on: payers (payers-and-patient-billing.sql) + is_owner() (auth-setup.sql).

-- ── Table ────────────────────────────────────────────────────────────────────
create table if not exists public.saldo_lotes (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid not null references public.patients(id) on delete cascade,
  payer_id          uuid references public.payers(id) on delete set null,  -- denormalized owner at creation (= patients.payer_id); credit follows the payer's group
  amount            numeric(10,2) not null,           -- total credit this payment created
  price_per_session numeric(10,2) not null,           -- consumption rate ($35 for a package)
  remaining         numeric(10,2) not null,           -- credit left; FIFO oldest-first; 0 = spent
  origin            text not null default 'package'
                      check (origin in ('package','overpayment','prepay','manual')),
  source_session_id uuid references public.sessions(id) on delete set null,          -- anchor (backfill) / triggering session
  proof_id          uuid references public.whatsapp_messages(id) on delete set null, -- comprobante that created it (overpayment)
  note              text,
  created_at        timestamptz not null default now()
);

-- Open lotes for an owner, oldest-first (the FIFO consumption lookup).
create index if not exists saldo_lotes_open_idx
  on public.saldo_lotes (patient_id, created_at)
  where remaining > 0;

alter table public.saldo_lotes enable row level security;

-- Owner-only, mirrors the payers table (billing is owner scope).
drop policy if exists saldo_lotes_owner on public.saldo_lotes;
create policy saldo_lotes_owner on public.saldo_lotes for all
  using (public.is_owner()) with check (public.is_owner());

-- Explicit GRANTs — a table created via apply_migration does NOT inherit the default
-- role grants (the whatsapp-delivery-status gotcha: the service-role writer hit
-- 42501 permission denied). The server processor writes with service_role.
grant select, insert, update, delete on public.saldo_lotes to service_role, authenticated;

-- ── BACKFILL — REVIEWED WITH NICOLÁS 2026-09-26 (still pending apply) ──────────
-- One lote per package_anchor pack that still has UNCONSUMED credit, i.e. fewer than
-- 4 PAID pack sessions so far. remaining = price_per_session × (4 − paid pack sessions).
-- Fully-paid packs (historical) get NO lote. Standard package rate $35; per-patient
-- exceptions carried explicitly below.
--
-- Flags resolved by Nicolás:
--   • Samantha Aldaz — the $24 is a real special discount → her pack is 4×$24=$96 at
--     $24/session (remaining 2 × $24 = $48), NOT the standard $140/$35.
--   • Micaela Castro — DROPPED. She just had her 4th session; balance is $0 (no credit,
--     no debt). She's since been re-typed as a menor (tutor added). No lote.
--   • Isabel Garcés — confirmed 4-session paquete, 2 taken / 2 pre-paid remaining
--     (Nicolás marked the 2nd session paid manually). Standard $35 → remaining $70.
--   • Loose pricing on later sessions ($39/$32) is fine and NOT corrected here — the
--     live-credit math keys off the count of PAID pack sessions, not their montos. Going
--     forward, a mismatched comprobante simply withholds (warning) until Nicolás fixes
--     the tarifa in Pacientes — the existing comprobante behaviour, unchanged.
--
-- 7 live-credit lotes ($433 total; payer_id filled from patients.payer_id at apply time):
--   Daniel Granja      2026-08-20  3/4 paid  →  1 × $35  = $35
--   Emily Rivera       2026-08-15  3/4 paid  →  1 × $35  = $35
--   Isabel Garcés      2026-09-09  2/4 paid  →  2 × $35  = $70
--   Ramesvary Henao    2026-08-31  1/4 paid  →  3 × $35  = $105
--   Samantha Aldaz     2026-08-26  2/4 paid  →  2 × $24  = $48   (special $24 rate)
--   Shyam Yelpi        2026-09-22  1/4 paid  →  3 × $35  = $105
--   Thomas Quevedo     2026-08-14  3/4 paid  →  1 × $35  = $35   (payer-billed)
--
-- INSERT (uncomment + run once Nicolás green-lights; source_session_id = the anchor):
-- insert into public.saldo_lotes (patient_id, payer_id, amount, price_per_session, remaining, origin, source_session_id, note)
-- select s.patient_id, p.payer_id, x.amount, x.rate, x.remaining, 'package', x.anchor_session_id, x.note
-- from (values
--   ('ca569ad7-7fc8-4c8c-85bd-6abe1f8819ff'::uuid, 140, 35, 35,  'Backfill package_anchor — 3/4 pagadas al 2026-09-26'),
--   ('a0c67c60-4811-49a2-b1db-06f5194b6075'::uuid, 140, 35, 35,  'Backfill package_anchor — 3/4 pagadas al 2026-09-26'),
--   ('60011384-e17b-4e2b-8e06-05772bcecd89'::uuid, 140, 35, 70,  'Backfill package_anchor — 2/4 pagadas al 2026-09-26'),
--   ('4c68ebdc-10ce-43da-a742-73ae16a17376'::uuid, 140, 35, 105, 'Backfill package_anchor — 1/4 pagadas al 2026-09-26'),
--   ('20351855-bafe-4a3f-b7e7-b21b74490992'::uuid, 96,  24, 48,  'Backfill package_anchor — 2/4 pagadas al 2026-09-26 (tarifa especial $24)'),
--   ('c94ea66d-5328-4655-b298-3126357bb007'::uuid, 140, 35, 105, 'Backfill package_anchor — 1/4 pagadas al 2026-09-26'),
--   ('56625b85-8d9b-4b02-b44a-23f499dcd9c2'::uuid, 140, 35, 35,  'Backfill package_anchor — 3/4 pagadas al 2026-09-26')
-- ) as x(anchor_session_id, amount, rate, remaining, note)
-- join public.sessions s on s.id = x.anchor_session_id
-- join public.patients p on p.id = s.patient_id;

-- ── FOLLOW-UP (separate, after backfill is confirmed live) ────────────────────
--   • Remove the package_anchor path: drop the auto-prepaid-at-scheduling logic
--     (src/lib/packages.js) + the drawer control, then DROP COLUMN sessions.package_anchor
--     (DESTRUCTIVE — needs explicit approval). Until then the two systems must not
--     double-pay: do not go live on lote consumption while package_anchor still prepays.
