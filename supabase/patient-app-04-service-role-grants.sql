-- Patient app — Phase 1: server-side functions (invite-check, register,
-- whatsapp check-in) use the service_role key; new tables need its grants.
-- Mirrors migration `service_role_grants_phase1` (applied 2026-09-15).
grant all on public.patient_invites  to service_role;
grant all on public.session_checkins to service_role;
