-- #83 (Nicolás, 22 Oct 2026) — repeated receipts are closed automatically; a reference can
-- only be applied once. A comprobante closed WITHOUT applying is marked here, so "applied"
-- = reconciled_at set AND cierre null (proofRef.js#isApplied). Additive, applied via connector.
alter table public.whatsapp_messages add column if not exists cierre text check (cierre in ('duplicado','copia','ignorado'));
alter table public.whatsapp_messages add column if not exists cierre_nota text;
comment on column public.whatsapp_messages.cierre is '#83: receipt closed WITHOUT applying (duplicado = repeat of an applied receipt; copia = extra copy of a pending one; ignorado = not a session payment). Applied = reconciled_at set AND cierre null.';
