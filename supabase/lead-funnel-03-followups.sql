-- Lead funnel — Phase C: follow-up send-tracking. Additive only.
-- Applied via the Supabase connector as migration `lead_funnel_03_followups`.
--
-- Each *_at stamps a one-time send so the every-15-min cron never repeats itself.
-- resultado_llamada_wamid stores the message id of the therapist-result template
-- so the therapist's "Se hizo/No contestó" reply (which carries context.id) maps
-- back to the exact lead.

alter table leads add column if not exists recordatorio_llamada_at timestamptz; -- call reminder (1h before)
alter table leads add column if not exists resultado_llamada_at timestamptz;    -- therapist-result template (5m after)
alter table leads add column if not exists resultado_llamada_wamid text;        -- to match the therapist's reply
alter table leads add column if not exists rebook_sent_at timestamptz;          -- no-show rebook (once)
alter table leads add column if not exists nudge48_sent_at timestamptz;         -- 48h first-session nudge (once)
