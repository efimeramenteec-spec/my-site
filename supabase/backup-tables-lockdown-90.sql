-- #90 (27 Oct 2026): lock down backup tables (Supabase "RLS Disabled in Public" alert).
-- Every public.*_backup_* table: RLS on (no policies ⇒ only service_role reads) +
-- REVOKE ALL from anon/authenticated. Non-destructive: no data touched, nothing dropped.
-- Idempotent — safe to re-run after new backups are created.
do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and c.relname like '%\_backup\_%'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

-- STANDING RULE for future backups — create them like this, in one go:
--   create table public.x_backup_YYYYMMDD as select * from public.x;
--   alter table public.x_backup_YYYYMMDD enable row level security;
--   revoke all on table public.x_backup_YYYYMMDD from anon, authenticated;
