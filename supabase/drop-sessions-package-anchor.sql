-- drop-sessions-package-anchor.sql
--
-- #19 step 7 (2026-09-25): retire the old 4-pack mechanism's last artifact.
--
-- sessions.package_anchor was the boolean marking the first session of a prepaid
-- 4-session pack (src/lib/packages.js + the ★ marker). Both were removed in bd31c6a
-- when saldo a favor (saldo_lotes) replaced the 4-pack. Since then the column has been
-- DORMANT — no code reads or writes it (grep-verified). The provenance of the 7
-- backfilled credit lotes is preserved independently in saldo_lotes.source_session_id
-- (the anchor session id) + saldo_lotes.note, so dropping the flag loses nothing
-- functional; only the boolean metadata on 20 historical anchor rows.
--
-- DESTRUCTIVE. Approved by Nicolás in chat (2026-09-25). Applied via the Supabase
-- connector as migration `drop_sessions_package_anchor`.
--
-- Supersedes supabase/sessions-package-anchor.sql (the original ADD COLUMN).

ALTER TABLE public.sessions DROP COLUMN IF EXISTS package_anchor;
