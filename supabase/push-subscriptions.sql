-- Web Push subscriptions for therapist notifications (confirm/cancel/new llamada).
-- Applied 2026-07-02 via the Claude Supabase connector (migration:
-- create_push_subscriptions). Kept here for reference. Idempotent.
--
-- One row per browser/device subscription; endpoint is globally unique.
-- terapeuta_id NULL = OWNER subscription → receives ALL notifications
-- (migration push_subscriptions_owner_rows, 2026-07-02). RLS: each therapist
-- manages only her own rows (my_terapeuta_id()); the owner has full access —
-- and is the only one who can hold NULL rows (for a therapist, NULL =
-- my_terapeuta_id() is not true). The notify function reads with service role.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  terapeuta_id uuid references therapists(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

drop policy if exists push_subs_self on push_subscriptions;
create policy push_subs_self on push_subscriptions
  for all
  using (terapeuta_id = public.my_terapeuta_id() or public.is_owner())
  with check (terapeuta_id = public.my_terapeuta_id() or public.is_owner());

grant select, insert, update, delete on push_subscriptions to authenticated, service_role;
