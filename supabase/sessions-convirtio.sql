-- #3 (2026-08-31): manual conversion override for llamada (free intro call)
-- sessions. NULL = auto-derive live (the patient has a later real session);
-- true/false = a therapist/owner set it by hand and the override wins.
-- Applied to prod via the Supabase connector (migration `add_sessions_convirtio`).
-- The Convirtió / No Convirtió toggle in Sesiones → Lista writes this column;
-- when it's NULL the app derives conversion live (see src/lib/conversion.js).

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS convirtio boolean;

COMMENT ON COLUMN sessions.convirtio IS
  'Llamada conversion manual override. NULL = auto-derive (patient has a later non-llamada, non-cancelled session). Only meaningful for tipo=llamada.';
