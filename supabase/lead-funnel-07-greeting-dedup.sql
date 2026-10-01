-- lead-funnel-07-greeting-dedup.sql
--
-- Fixes the live bug where booking intents ("quiero agendar mi primera cita",
-- "quiero empezar mi cita con la Dra. Carolina Almeida") were classified as
-- `saludo` and answered with repeated greetings. Adds the state the bot needs to
-- (a) send the welcome greeting only once per lead, (b) never repeat the same
-- canned text bubble twice in a row, and (c) ping Nicolás once when a lead is
-- stuck at the start of the funnel.
--
-- saludo_enviado  — the spec welcome ("Hola! Qué gusto que nos escribas") is sent
--                   at most once per lead.
-- last_bot_text   — last plain-text bubble sent by the bot, so the same canned
--                   text is never sent twice in a row.
-- stuck_push_at   — one-shot marker for the "3+ inbound, still on the starting
--                   step" safety-net push.

alter table public.leads
  add column if not exists saludo_enviado boolean not null default false,
  add column if not exists last_bot_text  text,
  add column if not exists stuck_push_at  timestamptz;
