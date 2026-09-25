-- whatsapp-messages-auto-reconciled.sql
--
-- Comprobante AUTO-MARK (spec #2). Applied 2026-09-25 via MCP apply_migration
-- `add_whatsapp_auto_reconciled`.
--
--   auto_reconciled  — true when the proof was reconciled AUTOMATICALLY by the
--                      comprobante auto-processor (no human tap), vs a manual owner
--                      confirm (which sets reconciled_by). Audit + UI badge.
--
-- Server-side auto-processing lives in netlify/lib/proofReconcile.mjs, run by the
-- scheduled process-proofs.mjs (gated by env COMPROBANTES_AUTO_LIVE) and the
-- guarded proofs-run.mjs manual trigger.
alter table public.whatsapp_messages
  add column if not exists auto_reconciled boolean not null default false;
