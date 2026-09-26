-- whatsapp-messages-alerted-at.sql
--
-- Comprobante AUTO-MARK warning alert (spec #2 additions). Applied 2026-09-26 via
-- MCP apply_migration `add_whatsapp_alerted_at`.
--
--   alerted_at  — when the auto-processor sent Nicolás the "comprobante sin
--                 identificar" WhatsApp alert for this held proof. NULL = not
--                 alerted yet. It's the THROTTLE: the scheduled processor
--                 (process-proofs.mjs, every 10 min) re-evaluates every unreconciled
--                 proof each run, so without this it would re-alert a withheld
--                 comprobante forever. One alert per proof.
--
-- Wiring lives in netlify/lib/proofReconcile.mjs (runProofAutomation → on withhold,
-- send via sendDualhookComprobanteAlert, stamp alerted_at). Owner-only RLS
-- (whatsapp_owner = is_owner() FOR ALL) already covers this column.
alter table public.whatsapp_messages
  add column if not exists alerted_at timestamptz;
