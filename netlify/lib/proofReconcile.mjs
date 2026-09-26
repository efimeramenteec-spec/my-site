// netlify/lib/proofReconcile.mjs
//
// Comprobante AUTO-MARK (spec #2). Deterministic code decides; the vision model
// only extracts. For each recent inbound payment proof: OCR it (if not read yet),
// evaluate the warning criteria, and — when clean — mark the covered session(s)
// paid + reconcile the proof automatically. Any warning → leave it pending so it
// stays in the Comprobantes card for Nicolás AND fire a one-time WhatsApp alert to
// him (template `comprobante_sin_identificar`, spec #2 additions) so a held proof
// isn't silent. NEVER marks more than the payment covers. Shared by the scheduled
// processor (process-proofs.mjs) and the guarded manual trigger (proofs-run.mjs).
//
// Criteria (all must hold to auto-act; else HOLD + one-time alert):
//   • matched to a patient · extraction 'ok' · confidence not 'low'
//   • recipient is Mariana (or unstated) · a real amount was read
//   • the reference (transfer_id) isn't already used on another comprobante
//
// Resolution, given the patient's owed sessions and their saldo a favor (#19 credit):
//   amount == $140 (exactly)          → ALWAYS a package → bank a $35/session lote,
//                                        then settle whatever the pooled credit now
//                                        fully covers (spec #19). No warning.
//   no debt                           → whole payment banks as a prepay lote (tarifa).
//   amount > owed NET of credit       → overpayment: mark all owed, draw existing
//                                        credit, bank the surplus as a lote (tarifa).
//                                        No warning (spec #2 additions / #3).
//   amount == owed NET of credit      → mark all owed, draw the credit (spec #5:
//                                        $10 credit + $40 session → $30 is exact).
//   amount == one session's price     → mark that session (oldest if several same-price).
//   anything less (underpayment/fit)  → HOLD (never partial credit — spec #4).

import { ocrProofRow } from './proofOcr.mjs'
import { sendDualhookComprobanteAlert } from './whatsapp.mjs'
import { isPackagePayment, PACKAGE_PRICE, PACKAGE_RATE } from './saldo.mjs'

const EPS = 0.5
const GYE_OFFSET_H = -5
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// withhold reason → Spanish motivo for the "comprobante sin identificar" alert to
// Nicolás (spec #2 additions: alert on mismatch / ambiguity / suspicion). Every
// withhold reason maps to one — a held proof always means a human is needed.
const MOTIVO = {
  unmatched: 'remitente no identificado',
  recipient_mismatch: 'el destinatario no es Mariana',
  no_unpaid_sessions: 'no hay sesiones pendientes que coincidan',
  amount_no_match: 'el monto no coincide con ninguna sesión',
  overpayment: 'el pago es mayor al saldo pendiente',
  reused_reference: 'comprobante repetido (referencia ya usada)',
  not_payment_proof: 'la imagen no parece un comprobante',
  low_confidence: 'lectura poco confiable',
  no_amount: 'no se pudo leer el monto',
}
function motivoFor(reason) {
  if (!reason) return 'requiere revisión'
  if (reason.startsWith('extraction_')) return 'no se pudo leer la imagen'
  return MOTIVO[reason] || 'requiere revisión'
}

// Best display name for the alert's {{1}} = who sent it: matched patient, else the
// OCR'd sender, else the raw WhatsApp phone, else "desconocido".
function alertSender(proof, ex) {
  return patientName(proof.patient) || ex?.sender_name ||
    proof.raw_payload?.message?.from || 'desconocido'
}

function gyeToday(now) {
  return new Date(now.getTime() + GYE_OFFSET_H * 3600e3).toISOString().slice(0, 10)
}

function sentAtMs(row) {
  const ts = row.raw_payload?.message?.timestamp
  return ts ? Number(ts) * 1000 : new Date(row.received_at).getTime()
}

function patientName(p) {
  if (!p) return null
  return [p.nombre, p.apellido].filter(Boolean).join(' ') || null
}

// Detected destination → método de pago (mirrors Comprobantes.jsx).
function metodoFromDestination(dest) {
  if (!dest) return null
  const d = String(dest).toLowerCase()
  if (d.includes('payphone')) return 'payphone'
  if (d.includes('paypal')) return 'paypal'
  return 'transferencia' // any bank / unknown → transferencia
}

// FIFO, full-coverage-only settle simulation: which unpaid sessions (oldest-first) a
// credit pool can fully pay. Mirrors consume_saldo_on_confirm — a session is only
// covered whole; leftover credit rolls to the next affordable session.
function coveredByCredit(unpaid, credit) {
  let c = round2(credit)
  const ids = []
  for (const s of unpaid) {
    const m = round2(Number(s.monto || 0))
    if (m <= EPS) continue
    if (c + EPS >= m) { c = round2(c - m); ids.push(s.id) }
  }
  return ids
}
const montoOf = (unpaid, id) => Number((unpaid.find((s) => s.id === id) || {}).monto || 0)

// Pure decision → a plan the runner applies:
//   { action:'skip'|'withhold', reason }
//   { action:'mark', sessionIds, metodo, creditConsume }         // pay sessions (+ draw credit)
//   { action:'lote', loteKind, lote:{amount,price_per_session,origin},
//                    sessionIds, metodo, creditConsume }          // bank credit (+ settle sessions)
// `unpaidSessions` MUST be ordered oldest-first. `ctx` = { credit, tarifa, payerId } where
// credit = the patient's total open saldo a favor. Does NOT check reused-reference (DB, runner).
export function decideAutoReconcile(proof, ex, unpaidSessions, ctx = {}) {
  if (proof.reconciled_at) return { action: 'skip', reason: 'already_reconciled' }
  if (!proof.patient_id) return { action: 'withhold', reason: 'unmatched' }
  if (proof.extraction_status !== 'ok') return { action: 'withhold', reason: `extraction_${proof.extraction_status || 'pending'}` }
  if (!ex || ex.is_payment_proof === false) return { action: 'withhold', reason: 'not_payment_proof' }
  if (ex.confidence === 'low') return { action: 'withhold', reason: 'low_confidence' }
  if (ex.recipient_name && !/mariana/i.test(ex.recipient_name)) return { action: 'withhold', reason: 'recipient_mismatch' }
  const amount = ex.amount
  if (amount == null) return { action: 'withhold', reason: 'no_amount' }

  const unpaid = unpaidSessions || []
  const credit = round2(Number(ctx.credit || 0))
  const tarifa = round2(Number(ctx.tarifa || 0)) || PACKAGE_RATE
  const metodo = metodoFromDestination(ex.destination) || proof.patient?.metodo_pago || 'transferencia'
  const total = round2(unpaid.reduce((a, s) => a + Number(s.monto || 0), 0))
  const netTotal = round2(Math.max(0, total - credit))
  const allIds = unpaid.map((s) => s.id)

  // Package: exactly $140 is ALWAYS a package (spec #19). Bank a $35/session lote and
  // settle whatever the pooled credit (existing + new) now fully covers, oldest-first.
  if (isPackagePayment(amount)) {
    const covered = coveredByCredit(unpaid, round2(credit + PACKAGE_PRICE))
    const creditConsume = round2(covered.reduce((a, id) => a + montoOf(unpaid, id), 0))
    return {
      action: 'lote', loteKind: 'package',
      lote: { amount: PACKAGE_PRICE, price_per_session: PACKAGE_RATE, origin: 'package' },
      sessionIds: covered, creditConsume, metodo,
    }
  }

  // No debt → whole payment banks as saldo a favor for the future (prepay, at tarifa).
  if (total <= EPS) {
    return {
      action: 'lote', loteKind: 'prepay',
      lote: { amount: round2(amount), price_per_session: tarifa, origin: 'prepay' },
      sessionIds: [], creditConsume: 0, metodo,
    }
  }

  // Overpayment (spec #2 additions / #3): cash covers the net owed, existing credit
  // covers the rest, surplus → a lote at the patient's tarifa. No warning.
  if (amount > netTotal + EPS) {
    return {
      action: 'lote', loteKind: 'overpayment',
      lote: { amount: round2(amount - netTotal), price_per_session: tarifa, origin: 'overpayment' },
      sessionIds: allIds, creditConsume: round2(total - netTotal), metodo,
    }
  }

  // Exact payment of everything owed NET of credit → mark all, draw the credit (spec #5).
  if (Math.abs(amount - netTotal) <= EPS) {
    return { action: 'mark', sessionIds: allIds, creditConsume: round2(total - amount), metodo }
  }

  // Exact price of one unpaid session → mark it (oldest of any same-price). Full price
  // paid, so any credit stays for later.
  const one = unpaid.find((s) => Math.abs(Number(s.monto) - amount) <= EPS)
  if (one) return { action: 'mark', sessionIds: [one.id], creditConsume: 0, metodo }

  // Anything less → underpayment / doesn't fit → ALWAYS a warning, never partial credit (spec #4).
  return { action: 'withhold', reason: 'amount_no_match' }
}

// Draw `amount` dollars of credit FIFO (oldest lote first) from a patient's open lotes.
// Returns dollars actually consumed. A freshly-inserted lote is newest, so it's only
// touched once the older lotes are exhausted (keeps a surplus lote intact on overpayment).
async function fifoConsumeLotes(supabase, patientId, amount) {
  let need = round2(amount)
  if (need <= EPS) return 0
  const { data: lotes, error } = await supabase
    .from('saldo_lotes').select('id, remaining')
    .eq('patient_id', patientId).gt('remaining', 0)
    .order('created_at', { ascending: true }).order('id', { ascending: true })
  if (error) { console.error('[proof-auto] lotes load failed:', error.message); return 0 }
  let used = 0
  for (const l of lotes || []) {
    if (need <= EPS) break
    const avail = Number(l.remaining || 0)
    const take = Math.min(avail, need)
    if (take <= 0) continue
    const { error: uErr } = await supabase
      .from('saldo_lotes').update({ remaining: round2(avail - take) }).eq('id', l.id)
    if (uErr) { console.error('[proof-auto] lote decrement failed:', uErr.message); break }
    need = round2(need - take); used = round2(used + take)
  }
  return used
}

async function insertLote(supabase, proof, ctx, lote) {
  const { error } = await supabase.from('saldo_lotes').insert({
    patient_id: proof.patient_id,
    payer_id: ctx.payerId ?? null,
    amount: lote.amount, price_per_session: lote.price_per_session, remaining: lote.amount,
    origin: lote.origin, proof_id: proof.id,
    note: `Auto — comprobante ${proof.id}`,
  })
  if (error) { console.error('[proof-auto] lote insert failed:', error.message); return false }
  return true
}

// Apply a plan (live). Mirrors updateSession's rules on the mark (stamps paid_at,
// refuses cancelled rows). Order for 'lote': insert first, then consume FIFO — so a
// package lote is used last (existing partial credit first) and an overpayment surplus
// lote is never drawn (need ≤ existing credit). Then mark sessions + stamp the proof.
async function applyPlan(supabase, proof, ctx, plan, now) {
  const iso = now.toISOString()
  if (plan.action === 'lote' && !(await insertLote(supabase, proof, ctx, plan.lote))) return false
  if (plan.creditConsume > EPS) await fifoConsumeLotes(supabase, proof.patient_id, plan.creditConsume)
  if (plan.sessionIds?.length) {
    const { error: sErr } = await supabase
      .from('sessions')
      .update({ pagado: true, metodo_pago: plan.metodo, paid_at: iso })
      .in('id', plan.sessionIds)
      .neq('estado', 'cancelada') // hard rule: a cancelled session is never pagado
    if (sErr) { console.error('[proof-auto] mark-paid failed:', sErr.message); return false }
  }
  const { error: rErr } = await supabase
    .from('whatsapp_messages')
    .update({ reconciled_at: iso, reconciled_by: null, reconciled_session_ids: plan.sessionIds || [], auto_reconciled: true })
    .eq('id', proof.id)
  if (rErr) { console.error('[proof-auto] reconcile-stamp failed:', rErr.message); return false }
  const tag = plan.action === 'lote' ? `lote ${plan.loteKind} $${plan.lote.amount}` : 'mark'
  console.log(`[proof-auto] proof ${proof.id} → ${tag}; sessions=${(plan.sessionIds || []).length} creditUsed=${plan.creditConsume || 0} (patient ${proof.patient_id}, ${plan.metodo})`)
  return true
}

// Is this transfer_id already recorded on a DIFFERENT comprobante? (reused reference)
async function referenceReused(supabase, proof, transferId) {
  if (!transferId) return false
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('id')
    .filter('extracted->>transfer_id', 'eq', transferId)
    .neq('id', proof.id)
    .limit(1)
  if (error) { console.warn('[proof-auto] reused-ref check failed (treat as not reused):', error.message); return false }
  return (data || []).length > 0
}

// Orchestrator. Options: { now, live, daysBack }.
//   • live=false → dry: OCR + decide, but mark/reconcile NOTHING (preview).
//   • live=true  → also apply the marks.
export async function runProofAutomation(supabase, { now = new Date(), live = false, daysBack = 7 } = {}) {
  const today = gyeToday(now)
  const sinceMs = now.getTime() - daysBack * 864e5
  const sinceISO = new Date(sinceMs).toISOString()

  const { data: rows, error } = await supabase
    .from('whatsapp_messages')
    .select('id, patient_id, received_at, reconciled_at, alerted_at, raw_payload, extracted, extraction_status,' +
      ' patient:patients(id,nombre,apellido,metodo_pago,tarifa,payer_id)')
    .eq('direccion', 'inbound')
    .is('reconciled_at', null)
    .gte('received_at', sinceISO)
    .order('received_at', { ascending: false })
  if (error) throw new Error('proofs query: ' + error.message)

  const proofs = (rows || [])
    .filter((r) => ['image', 'document'].includes(r.raw_payload?.message?.type))
    .filter((r) => sentAtMs(r) >= sinceMs)

  // Unpaid confirmed sessions for the matched patients, up to & including TODAY (a
  // patient commonly pays the same day their session is confirmed — a strict < today
  // would miss it and mis-bank the payment as prepay credit), oldest-first.
  const patientIds = [...new Set(proofs.filter((p) => p.patient_id).map((p) => p.patient_id))]
  const byPatient = {}
  if (patientIds.length) {
    const { data: sess, error: sErr } = await supabase
      .from('sessions')
      .select('id,patient_id,fecha,monto,estado,pagado,tipo')
      .in('patient_id', patientIds)
      .eq('pagado', false).eq('estado', 'confirmada').neq('tipo', 'llamada')
      .lte('fecha', today)
      .order('fecha', { ascending: true })
    if (sErr) throw new Error('sessions query: ' + sErr.message)
    for (const s of sess || []) (byPatient[s.patient_id] ||= []).push(s)
  }

  // Open saldo a favor per patient (#19) — the credit pool for net-of-credit matching
  // and for deciding what a package/overpayment lote settles.
  const creditByPatient = {}
  if (patientIds.length) {
    const { data: lotes, error: lErr } = await supabase
      .from('saldo_lotes').select('patient_id, remaining')
      .in('patient_id', patientIds).gt('remaining', 0)
    if (lErr) throw new Error('lotes query: ' + lErr.message)
    for (const l of lotes || []) {
      creditByPatient[l.patient_id] = round2((creditByPatient[l.patient_id] || 0) + Number(l.remaining || 0))
    }
  }

  const report = { today, live: !!live, marked: 0, lotes: 0, withheld: 0, alerted: 0, failed: 0, items: [] }
  for (const proof of proofs) {
    // Ensure extraction — OCR only if never attempted (don't re-burn failed/needs_review).
    let status = proof.extraction_status
    let ex = proof.extracted
    if (status == null || status === 'pending') {
      const r = await ocrProofRow(supabase, proof, { force: false })
      status = r.status; ex = r.extracted
      proof.extraction_status = status; proof.extracted = ex
    }

    const unpaid = byPatient[proof.patient_id] || []
    const ctx = {
      credit: creditByPatient[proof.patient_id] || 0,
      tarifa: proof.patient?.tarifa,
      payerId: proof.patient?.payer_id || null,
    }
    let plan = decideAutoReconcile(proof, ex, unpaid, ctx)

    // Reused-reference is ALWAYS a warning (spec #2: suspicion) — any auto action.
    if ((plan.action === 'mark' || plan.action === 'lote') && await referenceReused(supabase, proof, ex?.transfer_id)) {
      plan = { action: 'withhold', reason: 'reused_reference' }
    }

    const item = {
      proofId: proof.id, patient: patientName(proof.patient), patientId: proof.patient_id || null,
      amount: ex?.amount ?? null, transferId: ex?.transfer_id || null, extraction: status,
      action: plan.action, reason: plan.reason || null,
      sessionIds: plan.sessionIds || null, metodo: plan.metodo || null,
      loteKind: plan.loteKind || null, loteAmount: plan.lote?.amount ?? null,
      creditBefore: ctx.credit || 0, creditConsume: plan.creditConsume || 0,
    }
    if (plan.action === 'mark' || plan.action === 'lote') {
      const ok = live ? await applyPlan(supabase, proof, ctx, plan, now) : true
      if (!ok) { item.action = 'failed'; report.failed++ }
      else {
        if (plan.action === 'lote') report.lotes++
        if (plan.sessionIds?.length) report.marked++
      }
    } else if (plan.action === 'withhold') {
      const reason = plan.reason
      report.withheld++
      // Alert Nicolás ONCE per held proof (spec #2 additions). alerted_at throttles
      // the every-10-min re-evaluation; dry runs preview without sending. Best-effort
      // — a failed alert never crashes the batch and leaves alerted_at unset to retry.
      item.motivo = motivoFor(reason)
      if (!proof.alerted_at) {
        item.alert = live ? 'sending' : 'would-alert'
        if (live) {
          try {
            await sendDualhookComprobanteAlert({
              sender: alertSender(proof, ex), amount: ex?.amount ?? '?', motivo: item.motivo,
            })
            const { error: aErr } = await supabase
              .from('whatsapp_messages').update({ alerted_at: now.toISOString() }).eq('id', proof.id)
            if (aErr) { console.error('[proof-auto] alert-stamp failed:', aErr.message); item.alert = 'sent_stamp_failed' }
            else { item.alert = 'sent'; report.alerted++ }
          } catch (e) {
            console.error(`[proof-auto] alert failed for proof ${proof.id}:`, e.message)
            item.alert = 'failed'
          }
        }
      } else {
        item.alert = 'already_alerted'
      }
    }
    report.items.push(item)
  }
  return report
}
