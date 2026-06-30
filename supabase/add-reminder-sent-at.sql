-- Migration: reminder tracking for the Twilio WhatsApp reminder flow.
-- Run in Supabase → SQL Editor (DDL can't go through the service_role API).
--
-- Adds a nullable timestamp marking when the ~24h reminder was sent for a
-- session, so the hourly scheduled function (netlify/functions/send-reminders.js)
-- reminds each session exactly once and the inbound webhook
-- (netlify/functions/twilio-webhook.js) can target only already-reminded sessions.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- Helps the hourly window query (estado='programada' AND reminder_sent_at IS NULL).
CREATE INDEX IF NOT EXISTS idx_sessions_reminder_due
  ON sessions (fecha, hora_inicio)
  WHERE estado = 'programada' AND reminder_sent_at IS NULL;
