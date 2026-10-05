-- #48 — Monthly therapist payroll check (2026-10-05). ADDITIVE.
-- One row per therapist per periodo ('YYYY-MM'). Written by the executor / Netlify
-- functions (service_role); owner-only RLS.
create table if not exists payroll_runs (
  id           uuid primary key default gen_random_uuid(),
  periodo      text not null,
  terapeuta_id uuid not null references therapists(id),
  estado       text not null check (estado in ('enviado_ok', 'pendiente_lista', 'mismatch', 'factura_recibida')),
  sesiones     int,
  monto        numeric(10,2),
  detalle      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (periodo, terapeuta_id)
);
alter table payroll_runs enable row level security;
drop policy if exists payroll_runs_owner on payroll_runs;
create policy payroll_runs_owner on payroll_runs
  for all using (is_owner()) with check (is_owner());
grant select, insert, update, delete on payroll_runs to authenticated, service_role;
