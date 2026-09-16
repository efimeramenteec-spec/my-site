-- whatsapp-messages-extraction.sql
--
-- Payment-proof OCR (Comprobantes page). Instead of storing/showing the raw
-- bank screenshot, we run each inbound image/document through a vision model
-- (Claude Opus 4.8 via APIMart) and store the STRUCTURED fields it contains.
-- Additive + nullable; the table's RLS stays owner-only (`whatsapp_owner` =
-- is_owner() FOR ALL). Applied 2026-09-16 via apply_migration
-- `whatsapp_messages_extraction`.
--
--   extracted          jsonb  — the parsed transfer record (date/time, amount,
--                               origin bank, sender name, destination, transfer
--                               id, status, bank concepto, confidence, …).
--   extraction_status  text   — NULL/'pending' (not read yet), 'ok' (read),
--                               'needs_review' (low confidence / not a proof),
--                               'failed' (OCR call failed, e.g. empty balance).

alter table public.whatsapp_messages
  add column if not exists extracted jsonb,
  add column if not exists extraction_status text;
