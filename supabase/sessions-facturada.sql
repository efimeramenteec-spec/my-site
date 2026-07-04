-- Facturación tracking (Finanzas/Lista, manual for now). Applied in prod
-- 2026-07-04 via the Supabase connector (migration `sessions_facturada`).
-- Idempotent — safe to re-run.
--
-- Definition (Nicolas): "Pendiente de facturar" = session PAGADA but not
-- facturada (factura follows payment). Cancelled sessions and llamadas never
-- count either way; cancelling clears facturada like it clears pagado.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS facturada boolean NOT NULL DEFAULT false;
