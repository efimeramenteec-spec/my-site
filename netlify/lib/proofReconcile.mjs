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
// Criteria (all must hold to auto-mark):
//   • matched to a patient · extraction 'ok' · confidence not 'low'
//   • recipient is Mariana (or unstated) · a real amount was read
//   • the reference (transfer_id) isn't already used on another comprobante
//   • the amount resolves unambiguously to session(s):
//       amount = one session's price      → mark that session (oldest if several
//                                            same-price — Nicolás, 2026-09-25)
//       amount = exact sum of all unpaid  → mark all
//       amount > total owed (overpayment) → HOLD (saldo a favor #19 not built yet)
//       anything else (partial/mismatch)  → HOLD

import { ocrProofRow } from './proofOcr.mjs'
import { sendDualhookComprobanteAlert } from './whatsapp.mjs'

const EPS = 0.5
const GYE_OFFSET_H = -5

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

// Pure decision. Returns { action:'mark'|'withhold'|'skip', reason?, sessionIds?, metodo? }.
// `unpaidSessions` MUST be ordered oldest-first. Does NOT check reused-reference
// (that needs a DB lookup — done in the runner).
export function decideAutoReconcile(proof, ex, unpaidSessions) {
  if (proof.reconciled_at) return { action: 'skip', reason: 'already_reconciled' }
  if (!proof.patient_id) return { action: 'withhold', reason: 'unmatched' }
  if (proof.extraction_status !== 'ok') return { action: 'withhold', reason: `extraction_${proof.extraction_status || 'pending'}` }
  if (!ex || ex.is_payment_proof === false) return { action: 'withhold', reason: 'not_payment_proof' }
  if (ex.confidence === 'low') return { action: 'withhold', reason: 'low_confidence' }
  if (ex.recipient_name && !/mariana/i.test(ex.recipient_name)) return { action: 'withhold', reason: 'recipient_mismatch' }
  const amount = ex.amount
  if (amount == null) return { action: 'withhold', reason: 'no_amount' }
  if (!unpaidSessions?.length) return { action: 'withhold', reason: 'no_unpaid_sessions' }

  const total = unpaidSessions.reduce((a, s) => a + Number(s.monto || 0), 0)
  const metodo = metodoFromDestination(ex.destination) || proof.patient?.metodo_pago || 'transferencia'

  if (amount > total + EPS) return { action: 'withhold', reason: 'overpayment' }
  if (Math.abs(total - amount) <= EPS) return { action: 'mark', sessionIds: unpaidSessions.map((s) => s.id), metodo }
  const matches = unpaidSessions.filter((s) => Math.abs(Number(s.monto) - amount) <= EPS)
  if (matches.length >= 1) return { action: 'mark', sessionIds: [matches[0].id], metodo } // oldest-first
  return { action: 'withhold', reason: 'amount_no_match' } // partial payment / doesn't fit
}

// Apply a mark decision: set the session(s) paid (mirrors updateSession's rules —
// stamps paid_at, refuses cancelled rows) + stamp the proof reconciled (auto).
async function applyMark(supabase, proof, sessionIds, metodo, now) {
  const iso = now.toISOString()
  const { error: sErr } = await supabase
    .from('sessions')
    .update({ pagado: true, metodo_pago: metodo, paid_at: iso })
    .in('id', sessionIds)
    .neq('estado', 'cancelada') // hard rule: a cancelled session is never pagado
  if (sErr) { console.error('[proof-auto] mark-paid failed:', sErr.message); return false }
  const { error: rErr } = await supabase
    .from('whatsapp_messages')
    .update({ reconciled_at: iso, reconciled_by: null, reconciled_session_ids: sessionIds, auto_reconciled: true })
    .eq('id', proof.id)
  if (rErr) { console.error('[proof-auto] reconcile-stamp failed:', rErr.message); return false }
  console.log(`[proof-auto] proof ${proof.id} → marked ${sessionIds.length} session(s) paid (patient ${proof.patient_id}, ${metodo})`)
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
      ' patient:patients(id,nombre,apellido,metodo_pago)')
    .eq('direccion', 'inbound')
    .is('reconciled_at', null)
    .gte('received_at', sinceISO)
    .order('received_at', { ascending: false })
  if (error) throw new Error('proofs query: ' + error.message)

  const proofs = (rows || [])
    .filter((r) => ['image', 'document'].includes(r.raw_payload?.message?.type))
    .filter((r) => sentAtMs(r) >= sinceMs)

  // Unpaid confirmed past sessions for the matched patients (same predicate as the
  // Comprobantes reading layer / Finanzas Deudores), oldest-first.
  const patientIds = [...new Set(proofs.filter((p) => p.patient_id).map((p) => p.patient_id))]
  const byPatient = {}
  if (patientIds.length) {
    const { data: sess, error: sErr } = await supabase
      .from('sessions')
      .select('id,patient_id,fecha,monto,estado,pagado,tipo')
      .in('patient_id', patientIds)
      .eq('pagado', false).eq('estado', 'confirmada').neq('tipo', 'llamada')
      .lt('fecha', today)
      .order('fecha', { ascending: true })
    if (sErr) throw new Error('sessions query: ' + sErr.message)
    for (const s of sess || []) (byPatient[s.patient_id] ||= []).push(s)
  }

  const report = { today, live: !!live, marked: 0, withheld: 0, alerted: 0, failed: 0, items: [] }
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
    let { action, reason, sessionIds, metodo } = decideAutoReconcile(proof, ex, unpaid)

    // Reused-reference is ALWAYS a warning (spec #2: suspicion).
    if (action === 'mark' && await referenceReused(supabase, proof, ex?.transfer_id)) {
      action = 'withhold'; reason = 'reused_reference'; sessionIds = undefined
    }

    const item = {
      proofId: proof.id, patient: patientName(proof.patient), patientId: proof.patient_id || null,
      amount: ex?.amount ?? null, transferId: ex?.transfer_id || null, extraction: status,
      action, reason: reason || null, sessionIds: sessionIds || null, metodo: metodo || null,
    }
    if (action === 'mark') {
      if (live) {
        const ok = await applyMark(supabase, proof, sessionIds, metodo, now)
        if (ok) report.marked++
        else { item.action = 'failed'; report.failed++ }
      } else { report.marked++ } // would-mark (dry)
    } else if (action === 'withhold') {
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
