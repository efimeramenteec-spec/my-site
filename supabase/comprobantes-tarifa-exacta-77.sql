-- #77 (Nicolás, 19 Oct 2026): receipts auto-apply only when amount = patients.tarifa.
-- Everything else is HELD with a proposed allocation; credits only on his approval.
-- Additive only.

-- A credit (lote) counts toward payment reminders only once Nicolás approved it.
-- Existing automatic lotes stay NULL = not approved (manual review via the #77 audit).
alter table public.saldo_lotes add column if not exists aprobado_por uuid;
alter table public.saldo_lotes add column if not exists aprobado_at timestamptz;

-- The allocation the system proposes for a held receipt (pre-filled in Comprobantes).
alter table public.whatsapp_messages add column if not exists propuesta jsonb;
alter table public.whatsapp_messages add column if not exists propuesta_at timestamptz;
