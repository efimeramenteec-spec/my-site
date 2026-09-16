-- whatsapp-messages-reconcile.sql
--
-- Reading layer for WhatsApp payment proofs (Comprobantes page). Adds a
-- reconcile marker to whatsapp_messages so a single comprobante (the unique
-- inbound message, deduped by twilio_sid at ingest) can never be applied to
-- mark a payment twice. Additive + nullable; the table's RLS stays owner-only
-- (policy `whatsapp_owner` = is_owner() FOR ALL — covers this UPDATE from the
-- owner's browser). Applied 2026-09-15 via apply_migration `whatsapp_messages_reconcile`.
--
--   reconciled_at          — when Nicolás processed this proof (NULL = pending).
--   reconciled_by          — auth user who confirmed it.
--   reconciled_session_ids — which session(s) the proof was applied to (audit;
--                            supports the advance-payment case: 1 proof → N sessions).

alter table public.whatsapp_messages
  add column if not exists reconciled_at timestamptz,
  add column if not exists reconciled_by uuid references auth.users(id),
  add column if not exists reconciled_session_ids uuid[];

-- Fast lookup of still-pending proofs (reconciled_at IS NULL) in the recent window.
create index if not exists whatsapp_messages_pending_proofs_idx
  on public.whatsapp_messages (received_at desc)
  where direccion = 'inbound' and reconciled_at is null;
