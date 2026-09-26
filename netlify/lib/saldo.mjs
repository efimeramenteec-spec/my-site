// netlify/lib/saldo.mjs
//
// #19 Saldo a favor — the LOTES credit model (pure core, no DB). Replaces the
// package_anchor checkbox. Every payment that leaves credit creates a *lote*
// { amount, price_per_session, remaining }; consumption is FIFO (oldest lote first)
// at the lote's price, NOT the patient's tarifa. A package is always $140 for 4
// sessions → a lote at $35/session.
//
// These functions are the shared math for: the payment reminder (amount owed NET of
// credit — spec #8), the comprobante matcher (a proof equal to the net owed is exact,
// an overpayment from a matched sender becomes a new lote — spec #2 additions), and
// the confirmada→pagado trigger (deduct credit, set paid). DB wiring is separate and
// lands AFTER Nicolás approves the backfill (supabase/saldo-lotes.sql dry-run).
//
// Rounded to cents throughout so FIFO remainders don't drift.

export const PACKAGE_PRICE = 140     // a 4-pack always costs $140
export const PACKAGE_SIZE = 4
export const PACKAGE_RATE = 35       // → $35 per session (PACKAGE_PRICE / PACKAGE_SIZE)
const EPS = 0.005

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// Total available credit for an owner = sum of open lotes' remaining.
export function totalCredit(lotes = []) {
  return round2((lotes || []).reduce((a, l) => a + Number(l.remaining || 0), 0))
}

// Amount still owed on `amountOwed` after applying available credit (never below 0).
// This is what the payment reminder asks for, and the exact figure a comprobante must
// equal to auto-mark when the patient has credit (spec #2: "underpayment is ALWAYS a
// warning … Only exception: when the patient has credit, the amount owed is net of it").
export function netOwed(amountOwed, lotes = []) {
  return round2(Math.max(0, Number(amountOwed || 0) - totalCredit(lotes)))
}

// True when a payment amount is exactly a package purchase ($140) → recognise it as a
// package lote ($35/session) instead of matching it to sessions (spec #19).
export function isPackagePayment(amount) {
  return Math.abs(Number(amount) - PACKAGE_PRICE) <= EPS
}

// The lote a $140 package payment creates.
export function packageLote(extra = {}) {
  return { amount: PACKAGE_PRICE, price_per_session: PACKAGE_RATE, remaining: PACKAGE_PRICE, origin: 'package', ...extra }
}

// FIFO-consume `amount` dollars from `lotes` (already ordered oldest-first).
// Returns { applied, shortfall, lotes } where `lotes` is the updated remaining per id
// (only the touched ones). `applied` = how much credit was actually drawn (≤ amount);
// `shortfall` = amount - applied (what the patient still owes — the reminder asks only
// for this, spec #19 "odd remainder is applied to the next session").
export function consume(lotes = [], amount = 0) {
  let need = round2(Math.max(0, Number(amount || 0)))
  const applied0 = need
  const touched = []
  for (const l of lotes) {
    if (need <= EPS) break
    const avail = Number(l.remaining || 0)
    if (avail <= EPS) continue
    const take = Math.min(avail, need)
    touched.push({ id: l.id, remaining: round2(avail - take) })
    need = round2(need - take)
  }
  return { applied: round2(applied0 - need), shortfall: round2(need), lotes: touched }
}
