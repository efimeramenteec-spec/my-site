-- #92g (28 Oct 2026) — ADDITIVE. owner_outbox remembers the WhatsApp message ids
-- of a delivered row (ownerOutbox.mjs#deliverRow), so a send can be traced to
-- whatsapp_delivery_status. Image / exact-text messages: see ownerOutbox.mjs.
alter table public.owner_outbox add column if not exists wamids text[];
