-- Cash-flow groundwork (Finanzas): WHEN a session was actually paid.
-- Applied in prod 2026-07-04 via the Supabase connector (migration
-- `sessions_paid_at`). Idempotent — safe to re-run.
--
-- `pagado` is a boolean with no date, so "ingreso de julio" can only mean
-- sessions DATED in July that are paid (accrual view). paid_at records the
-- real payment moment for a future cash view ("what money entered this
-- month"). The app stamps it whenever pagado flips true (queries.js
-- updateSession) and clears it when pagado flips false (incl. cancellations
-- and the twilio-webhook WhatsApp cancel). Server-stamped only — it is NOT
-- in the SESSION_COLUMNS write whitelist, so client payloads can't set it.
-- Sessions paid before 2026-07-04 have NULL (unknowable).

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;
