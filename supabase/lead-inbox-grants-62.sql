-- #62 — Bot silencioso por #59 (2026-10-08). Additive only.
-- lead_inbox (lead-funnel-12-turnos.sql) was created without table grants, so the
-- service_role got "permission denied for table lead_inbox" on every enqueue and
-- no lead message reached runBot from 7 Oct 13:38 to 8 Oct. RLS (is_owner) unchanged.
grant select, insert, update, delete on table public.lead_inbox to service_role;
grant select, insert, update, delete on table public.lead_inbox to authenticated;
