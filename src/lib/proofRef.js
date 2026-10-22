// src/lib/proofRef.js
//
// #83 (Nicolás, 22 Oct 2026) — a bank reference can only be applied ONCE. Shared by the
// server (netlify/lib/proofReconcile.mjs) and the panel's manual "Marcar pagado" so both
// judge "same receipt" and "applied" identically. Pure, no I/O.

// Bank references are the same number written differently across screenshots:
// leading zeros, spaces, hyphens, mixed case. Compare on the canonical form.
//
// 2026-09-29: Andrea Torres sent one transfer twice; OCR read '91822893' on one
// screenshot and '0091822893' on the other. The old exact-string match saw two
// different references and credited the money twice. Stripping leading zeros can
// in theory collide two genuinely different references — that errs toward
// withholding for human review, which is the safe direction for money.
export function normalizeReference(raw) {
  const cleaned = String(raw ?? '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase()
  if (!cleaned) return ''
  const trimmed = cleaned.replace(/^0+/, '')
  return trimmed || '0' // an all-zeros reference stays a reference
}

// APPLIED = reconciled into sessions/credit. A receipt closed without applying
// (whatsapp_messages.cierre = duplicado | copia | ignorado) is NOT applied.
export const isApplied = (row) => !!row?.reconciled_at && !row?.cierre
export const isPending = (row) => !row?.reconciled_at

const bankOk = (a, b) => !a || !b || String(a).trim().toLowerCase() === String(b).trim().toLowerCase()

// Same receipt = same normalized reference + same amount + same bank (destination and
// origin bank; a side the OCR couldn't read doesn't disqualify).
export function sameReceipt(exA, exB) {
  const ra = normalizeReference(exA?.transfer_id)
  if (!ra || ra !== normalizeReference(exB?.transfer_id)) return false
  if (exA?.amount == null || exB?.amount == null) return false
  if (Math.abs(Number(exA.amount) - Number(exB.amount)) > 0.005) return false
  return bankOk(exA.destination, exB.destination) && bankOk(exA.origin_bank, exB.origin_bank)
}

// Is this reference already on an APPLIED receipt (other than `selfId`)? Reference only —
// the amount/bank don't matter for the "applied once" rule.
export function referenceAppliedIn(rows, selfId, transferId) {
  const target = normalizeReference(transferId)
  if (!target) return null
  return (rows || []).find((r) => r.id !== selfId && isApplied(r) &&
    normalizeReference(r?.extracted?.transfer_id) === target) || null
}
