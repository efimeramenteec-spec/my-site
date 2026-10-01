-- supabase/whatsapp-messages-outbound-to-idx.sql
--
-- Second "not a lead" rule (2026-10-01): if the business number wrote to someone
-- FIRST (a manual smb_message_echo, now stored as an `outbound` whatsapp_messages
-- row), their later inbound reply is NOT a new lead. leadBot.handleEchoes stores
-- the echo with the recipient's digits at raw_payload->>'to_digits';
-- leadBot.hasEarlierOutbound looks it up. This partial index keeps that lookup cheap.

CREATE INDEX IF NOT EXISTS whatsapp_messages_outbound_to_idx
  ON whatsapp_messages ((raw_payload->>'to_digits'))
  WHERE direccion = 'outbound';
