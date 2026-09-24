-- Payment-reminder tracking (spec #8). Applied 2026-09-24 via MCP apply_migration
-- "add_payment_reminder_fields".
--
-- recordatorio_pago_at: stamped when the bot sends a payment reminder for a session
--   (reminded exactly once; drives the "En mora" state = reminded + still unpaid).
-- pago_excluido: session is permanently excluded from the payment-reminder automation
--   (handled manually / outside the bot). Kept SEPARATE from recordatorio_pago_at so a
--   manual exclusion never makes a patient look "en mora".
alter table sessions add column if not exists recordatorio_pago_at timestamptz;
alter table sessions add column if not exists pago_excluido boolean not null default false;

create index if not exists idx_sessions_pago_pendiente
  on sessions (fecha)
  where estado = 'confirmada' and pagado = false;

-- Go-live boundary (2026-09-24): every unpaid confirmed non-llamada session BEFORE
-- 2026-09-22 was flagged pago_excluido=true (handled manually, the last manual batch),
-- so the automation only ever charges from the 22nd onward. Reference only — the
-- backfill was a one-time data UPDATE, not part of this schema migration:
--   update sessions set pago_excluido = true
--   where fecha < '2026-09-22' and estado='confirmada' and tipo<>'llamada' and pagado=false;
