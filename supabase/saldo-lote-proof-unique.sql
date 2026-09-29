-- One comprobante may create at most ONE saldo lote.
--
-- 2026-09-29: proof d3cbbe00 created two identical $140 lotes five seconds
-- apart (Andrea Torres), inflating her balance by $140. insertLote had no
-- idempotency, so any double delivery of the same proof to process-proofs
-- (overlapping */10 crons, a retry) credited the money twice. This index makes
-- the second insert a no-op instead of a second lote — the same duplicate guard
-- the invoicing path already relies on.
--
-- proof_id IS NULL for manually created lotes, which stay unconstrained.
create unique index if not exists saldo_lotes_proof_id_unique
  on saldo_lotes (proof_id)
  where proof_id is not null;
