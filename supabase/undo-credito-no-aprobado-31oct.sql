-- 31 Oct 2026 (Nicolás): undo the 5 session payments made on 22 Oct (#85) from credit
-- that was never stamped approved. NO credit for anybody: lotes zeroed (not deleted),
-- consumos marked revertido_at, sessions back to unpaid with pago_excluido=true (no
-- automatic payment reminder — the patients DID send receipts), and the 5 receipts
-- un-reconciled so they show in Comprobantes for manual review (the tab now keeps
-- pending receipts up to 90 days). Already run via the Supabase connector.
-- Backups (RLS on, revoked from anon/authenticated, #90):
--   undo_credito_backup_20261031_{sessions,lotes,consumos,proofs}
-- Sessions: Paola Ibarra 8 Oct $30 · Daniela Santillan 17 Oct $36 · Karo Merizalde 15 Oct $35 ·
--           Emilie Conforme 17 Oct $36 (already invoiced) · Zara Basantez 22 Oct $32
-- Lotes:    064a92fe 6b64f244 cc82f2a1 60e5eb45 9c3929c4
-- Receipts: 9862d0a1 189c31f1 b6ff388c f95871a1 dbcc020b
update saldo_consumos set revertido_at = now()
 where id in ('66c5b846-8ea0-4e6b-9483-597314fd99e1','c5e41d29-ae4a-4155-b37f-d70174e33c9c','62e99a13-e9b3-4bf0-823c-63bb3cf5c865','712b3dc0-c486-4dd0-b52e-2e5e43db13a9','9a94824c-b1b2-4896-9649-88461df24f04') and revertido_at is null;
update saldo_lotes set remaining = 0, note = note || ' | 31 Oct: pago deshecho por Nicolás, sin saldo; comprobante vuelve a Comprobantes para revisión manual'
 where id in ('064a92fe-4997-4ed9-8202-763cb0c8fb5d','6b64f244-371b-4f4b-afe7-0caf12ba1a28','cc82f2a1-7332-4ae7-8474-5a4d9e793595','60e5eb45-b8f4-4afa-8eaa-e347888281ec','9c3929c4-cc79-4970-a94d-1b093c060b4f');
update sessions set pagado = false, paid_at = null, pago_excluido = true
 where id in ('add690ea-6ded-4cea-9213-59e7a890b6d6','f458140a-7669-4fb1-b69c-6f284d2fcdce','d24f4f32-2cb2-4d0b-ba29-0120194a920d','5e3df344-f14b-4506-80d5-7eae718e651a','9d848a37-2395-4f07-aebf-22deac170432');
update whatsapp_messages set reconciled_at = null, reconciled_by = null, auto_reconciled = false, reconciled_session_ids = '{}'
 where id in ('9862d0a1-00fb-42df-bb2e-c219aa18e7d1','189c31f1-3230-4d1a-90a8-444cec52ba7c','b6ff388c-67e3-447f-9ea8-2f8565f215c8','f95871a1-856e-4360-8f91-8714f5605dea','dbcc020b-9a9c-40fb-8975-7d5d69fc573c');
