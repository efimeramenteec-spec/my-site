-- #99 (2 Nov 2026): one run at a time per scheduled function.
--
-- Netlify's scheduler gives up on a scheduled function after ~15 s (status 499) and
-- invokes it AGAIN, while the first execution keeps running to the end. Any job that
-- sends first and stamps after (payment reminders, comprobante alerts, sesiones
-- pendientes, lead follow-ups, appointment reminders) then sends twice. Seen: payment
-- reminders 23 Oct (5 patients) + 2 Nov (4), comprobante alerts to Nicolás 2–4×,
-- one sesión-pendiente reminder 21 Oct.
--
-- try_cron_lock(name, holder, ttl) → true if this invocation got the lock (free or
-- expired), false if another run holds it. release_cron_lock frees it at the end.
-- The TTL only matters if a run dies without releasing (then the next tick takes over).

create table if not exists public.cron_locks (
  name         text primary key,
  locked_until timestamptz not null,
  holder       text,
  started_at   timestamptz
);
alter table public.cron_locks enable row level security;
revoke all on table public.cron_locks from anon, authenticated;
grant select, insert, update, delete on table public.cron_locks to service_role;

create or replace function public.try_cron_lock(p_name text, p_holder text, p_ttl_seconds int default 300)
returns boolean
language plpgsql
set search_path = public
as $$
declare got int;
begin
  insert into public.cron_locks (name, locked_until, holder, started_at)
  values (p_name, now() + make_interval(secs => p_ttl_seconds), p_holder, now())
  on conflict (name) do update
    set locked_until = excluded.locked_until, holder = excluded.holder, started_at = excluded.started_at
    where public.cron_locks.locked_until < now();
  get diagnostics got = row_count;
  return got > 0;
end $$;

create or replace function public.release_cron_lock(p_name text, p_holder text)
returns void
language sql
set search_path = public
as $$
  update public.cron_locks set locked_until = now() - interval '1 second' where name = p_name and holder = p_holder;
$$;

revoke all on function public.try_cron_lock(text, text, int) from public, anon, authenticated;
revoke all on function public.release_cron_lock(text, text) from public, anon, authenticated;
grant execute on function public.try_cron_lock(text, text, int) to service_role;
grant execute on function public.release_cron_lock(text, text) to service_role;
