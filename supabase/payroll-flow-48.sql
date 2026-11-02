-- #48 payroll workflow (Nicolás, 2 Nov 2026). ADDITIVE.
-- payroll_runs row per therapist per periodo now also tracks the automatic flow:
--   pedido_at / pedido_wamid  → when the conteo_sesiones template went out (null = list already in, no template)
--   revisado_hasta            → newest inbound message already read for this run
--   conteo_terapeuta          → the count the therapist sent
--   aviso_sin_lista_at        → Nicolás told "no list after 24 h" (once)
--   aviso_owner_at            → Nicolás told about a mismatch / unreadable reply (once per state)
-- Estados used: pendiente_lista → enviado_ok | mismatch (→ pendiente_lista again on "check X again").
alter table public.payroll_runs add column if not exists pedido_at timestamptz;
alter table public.payroll_runs add column if not exists pedido_wamid text;
alter table public.payroll_runs add column if not exists revisado_hasta timestamptz;
alter table public.payroll_runs add column if not exists conteo_terapeuta int;
alter table public.payroll_runs add column if not exists aviso_sin_lista_at timestamptz;
alter table public.payroll_runs add column if not exists aviso_owner_at timestamptz;
