-- 2026-10-02 — WhatsApp delivery of the factura PDF (RIDE) to the billing party.
-- contifico_doc_id: Contífico documento id, stamped by facturar.mjs on emit (needed to
--   fetch the RIDE url later). factura_enviada_at: when the RIDE was WhatsApp'd —
--   the send is skipped once set, so nobody gets an invoice twice.
alter table sessions add column if not exists contifico_doc_id text;
alter table sessions add column if not exists factura_enviada_at timestamptz;
