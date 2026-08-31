-- #4 (2026-08-31): 4-session packages. A session with package_anchor=true is the
-- FIRST session of a prepaid 4-pack for that patient. Everything else derives
-- from it (src/lib/packages.js): the pack covers the anchor + the next 3 real
-- (non-llamada, non-cancelled) sessions; those default to paid at scheduling;
-- and a patient shows the ⭐ package marker if they have any anchor session.
-- Marked via the owner-only control in the session drawer. Applied to prod via
-- the Supabase connector (migration `add_sessions_package_anchor`).

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS package_anchor boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN sessions.package_anchor IS
  'True = this session is the first of a prepaid 4-session package (#4). The pack covers this + the next 3 real sessions of the patient.';
