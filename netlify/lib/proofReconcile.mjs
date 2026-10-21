// netlify/lib/proofReconcile.mjs
//
// ── #80 RULE v2 (Nicolás, 19 Oct 2026): as #77 below, PLUS exactly 4 × tarifa = a prepaid
// package of 4 → mark the unpaid sessions it covers (oldest first, ≤4) and keep the rest as
// a package lote stamped aprobado_at by the rule — the ONLY automatic lote. Any other amount
// (e.g. $140 for a $39 patient) is held like everything else.
// ── #77 RULE (Nicolás, 19 Oct 2026) — overrides everything below ──────────────
// A receipt is auto-applied ONLY when its amount EXACTLY equals patients.tarifa of the
// matched patient (the fixed per-session rate — not the amount owed, not net of credit)
// AND that patient has an unpaid session → the oldest unpaid session is marked paid.
// Payer groups (#61): exact match against the tarifa of any one patient in the group →
// the oldest unpaid session among the matching patients. EVERYTHING ELSE is HELD for
// Nicolás (more, less, multiples, packages, several sessions, unreadable, no debt):
// nothing is marked, NO credit is created. The held receipt keeps the allocation the
// old rules below would have made (`proposeAllocation`) in whatsapp_messages.propuesta;
// approving it in Comprobantes (`approveProof`) applies it through the same applyPlan,
// and any lote it banks is stamped aprobado_por/aprobado_at. One notifyOwner per held
// receipt (kind 'comprobante_pendiente'). Why: auto-banked credits ($1 from a $40
// payment) made reminders ask patients wrong amounts ($38 instead of $39).
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
// Payer receipts (#61, Nicolás 2026-10-08): payment reminders now go to the PAYER, so
// a payer replies with the receipt from THEIR number — which matches no patient. The
// sender is also matched against payers.telefono, and the owed sessions of ALL
// patients with that payer_id are considered:
//   • only one of them owes → the proof is that patient's (all rules below apply);
//   • several owe → pooled oldest-first, credit ignored, and ONLY an exact 'mark'
//     (all owed, or one session's price) is automatic; anything that would bank a
//     lote (package/prepay/overpayment) is HELD — whose saldo it is needs a human.
//
// Resolution, given the patient's owed sessions and their saldo a favor (#19 credit):
//   amount == $140 (exactly)          → ALWAYS a package: 4 sessions at $35 — the oldest
//                                        unpaid (≤4) marked, the rest a $35/session lote
//                                        (#81 B: never pooled with other credit).
//   no debt                           → whole payment banks as a prepay lote (tarifa).
//   amount > owed NET of credit       → overpayment: mark all owed, draw existing
//                                        credit, bank the surplus as a lote (tarifa).
//                                        No warning (spec #2 additions / #3).
//   amount == owed NET of credit      → mark all owed, draw the credit (spec #5:
//                                        $10 credit + $40 session → $30 is exact).
//   amount == one session's price     → mark that session (oldest if several same-price).
//   anything less (underpayment/fit)  → HOLD (never partial credit — spec #4).

import { ocrProofRow } from './proofOcr.mjs'
import { normalizePhone } from './whatsapp.mjs'
import { notifyOwner } from './ownerOutbox.mjs'
import { isPackagePayment, loteGastable, PACKAGE_PRICE, PACKAGE_RATE } from './saldo.mjs'

const EPS = 0.5
const GYE_OFFSET_H = -5
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// withhold reason → Spanish motivo for the "comprobante sin identificar" alert to
// Nicolás (spec #2 additions: alert on mismatch / ambiguity / suspicion). Every
// withhold reason maps to one — a held proof always means a human is needed.
const MOTIVO = {
  unmatched: 'comprobante de número desconocido',
  recipient_mismatch: 'el destinatario no es Mariana',
  no_unpaid_sessions: 'no hay sesiones pendientes que coincidan',
  amount_no_match: 'el monto no coincide con ninguna sesión',
  overpayment: 'el pago es mayor al saldo pendiente',
  reused_reference: 'comprobante repetido (referencia ya usada)',
  not_payment_proof: 'la imagen no parece un comprobante',
  low_confidence: 'lectura poco confiable',
  payer_ambiguous: 'pago de un pagador con varios pacientes pendientes',
  no_amount: 'no se pudo leer el monto',
  monto_distinto_tarifa: 'el monto no es la tarifa fija del paciente',
  monto_sesion_distinto: 'la sesión pendiente más antigua tiene otro valor',
  remitente_mariana: 'lo envió Mariana desde su número (reenvío de un paciente)',
}
function motivoFor(reason) {
  if (!reason) return 'requiere revisión'
  if (reason.startsWith('extraction_')) return 'no se pudo leer la imagen'
  return MOTIVO[reason] || 'requiere revisión'
}

// Best display name for the alert's {{1}} = who sent it: matched patient, else the
// OCR'd sender, else the raw WhatsApp phone, else "desconocido".
function alertSender(proof, ex) {
  return patientName(proof.patient) || proof.payerName || ex?.sender_name ||
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


// Pure decision → a plan the runner applies:
//   { action:'skip'|'withhold', reason }
//   { action:'mark', sessionIds, metodo, creditConsume }         // pay sessions (+ draw credit)
//   { action:'lote', loteKind, lote:{amount,price_per_session,origin},
//                    sessionIds, metodo, creditConsume }          // bank credit (+ settle sessions)
// `unpaidSessions` MUST be ordered oldest-first. `ctx` = { credit, tarifa, payerId } where
// credit = the patient's total open saldo a favor. Does NOT check reused-reference (DB, runner).
export function proposeAllocation(proof, ex, unpaidSessions, ctx = {}) {
  const pre = precheck(proof, ex)
  if (pre) return pre
  return allocate(proof, ex, unpaidSessions, ctx)
}

// Checks shared by the #77 gate and the proposal: is this a readable receipt for a
// known patient, paid to Mariana, with an amount? Returns a skip/withhold plan or null.
function precheck(proof, ex) {
  if (proof.reconciled_at) return { action: 'skip', reason: 'already_reconciled' }
  // Not a receipt at all (a random photo/screenshot) → skip SILENTLY, no alert.
  // This is checked BEFORE the unmatched/extraction branches so a non-receipt image
  // from an unknown number can't spam Nicolás with a "comprobante" alert (#2): only
  // something that actually reads as a payment proof is worth flagging.
  if (ex && ex.is_payment_proof === false) return { action: 'skip', reason: 'not_payment_proof' }
  if (!proof.patient_id) return { action: 'withhold', reason: 'unmatched' }
  if (proof.extraction_status !== 'ok') return { action: 'withhold', reason: `extraction_${proof.extraction_status || 'pending'}` }
  if (!ex) return { action: 'withhold', reason: 'not_payment_proof' }
  if (ex.confidence === 'low') return { action: 'withhold', reason: 'low_confidence' }
  if (ex.recipient_name && !/mariana/i.test(ex.recipient_name)) return { action: 'withhold', reason: 'recipient_mismatch' }
  if (ex.amount == null) return { action: 'withhold', reason: 'no_amount' }
  return null
}

function allocate(proof, ex, unpaidSessions, ctx) {
  const amount = ex.amount
  const unpaid = unpaidSessions || []
  const credit = round2(Number(ctx.credit || 0))
  const tarifa = round2(Number(ctx.tarifa || 0)) || PACKAGE_RATE
  const metodo = metodoFromDestination(ex.destination) || proof.patient?.metodo_pago || 'transferencia'
  const total = round2(unpaid.reduce((a, s) => a + Number(s.monto || 0), 0))
  const netTotal = round2(Math.max(0, total - credit))
  const allIds = unpaid.map((s) => s.id)

  // Package: exactly $140 is ALWAYS a package (spec #19). #81 B: it pays 4 sessions at $35
  // each — the oldest unpaid (≤4) are marked directly, the rest stays as a package lote of
  // whole units. Never pooled with other credit.
  if (isPackagePayment(amount)) {
    const n = Math.round(PACKAGE_PRICE / PACKAGE_RATE)
    const covered = unpaid.slice(0, n).map((s) => s.id)
    const left = round2((n - covered.length) * PACKAGE_RATE)
    // #82: a session the package pays is worth the package price ($35), not the patient's $39.
    if (left <= EPS) return { action: 'mark', sessionIds: covered, creditConsume: 0, metodo, sessionMonto: PACKAGE_RATE }
    return {
      action: 'lote', loteKind: 'package',
      lote: { amount: left, price_per_session: PACKAGE_RATE, origin: 'package' },
      sessionIds: covered, creditConsume: 0, metodo, sessionMonto: PACKAGE_RATE,
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

// #77 gate — the ONLY automatic path. `group` = [{ id, tarifa, unpaid }] for every
// patient the receipt can belong to (one entry for a plain patient; the payer's
// patients for a payer receipt), each `unpaid` oldest-first. Returns
//   { action:'mark', sessionIds:[id], patientId, creditConsume:0, metodo }  — auto
//   { action:'withhold', reason }                                            — Nicolás
//   { action:'skip', reason }                                                — silent
// Never banks a lote and never draws credit.
const EXACT = 0.005
const PACK = 4
const same = (a, b) => Math.abs(round2(a) - round2(b)) <= EXACT
const byFecha = (a, b) => (a.fecha > b.fecha ? 1 : a.fecha < b.fecha ? -1 : 0)
export function decideAutoReconcile(proof, ex, group, opts = {}) {
  const pre = precheck({ ...proof, patient_id: proof.patient_id || (group?.length ? group[0].id : null) }, ex)
  if (pre) return pre
  const amount = round2(Number(ex.amount))
  const metodo = metodoFromDestination(ex.destination) || opts.metodoPago || 'transferencia'
  const withRate = (group || []).filter((g) => Number(g.tarifa) > 0)

  // (a) exactly one tarifa → the oldest unpaid session of a matching patient.
  const rateHits = withRate.filter((g) => same(g.tarifa, amount))
  if (rateHits.length) {
    const candidates = rateHits.flatMap((g) => (g.unpaid || []).map((s) => ({ ...s, patient_id: s.patient_id || g.id })))
    if (!candidates.length) return { action: 'withhold', reason: 'no_unpaid_sessions' }
    candidates.sort(byFecha)
    const oldest = candidates[0]
    // The session must cost what was paid — a $39 receipt never closes a $50 session.
    if (!same(oldest.monto, amount)) return { action: 'withhold', reason: 'monto_sesion_distinto' }
    return { action: 'mark', sessionIds: [oldest.id], patientId: oldest.patient_id, creditConsume: 0, metodo }
  }

  // (b) #80: exactly 4 × tarifa → a prepaid package of 4 for ONE patient: mark the unpaid
  // sessions it covers (oldest first, up to 4, each must cost the tarifa) and keep the
  // rest as a package lote at the tarifa, approved by the rule itself (the only automatic lote).
  const packHits = withRate.filter((g) => same(PACK * g.tarifa, amount))
  if (packHits.length > 1) return { action: 'withhold', reason: 'payer_ambiguous' }
  if (packHits.length === 1) {
    const g = packHits[0]
    const rate = round2(g.tarifa)
    const covered = [...(g.unpaid || [])].sort(byFecha).slice(0, PACK)
    if (covered.some((s) => !same(s.monto, rate))) return { action: 'withhold', reason: 'monto_sesion_distinto' }
    const left = round2((PACK - covered.length) * rate)
    const plan = { sessionIds: covered.map((s) => s.id), patientId: g.id, creditConsume: 0, metodo, autoPackage: true }
    if (left <= EXACT) return { action: 'mark', ...plan }
    return { action: 'lote', loteKind: 'package', lote: { amount: left, price_per_session: rate, origin: 'package' }, ...plan }
  }
  return { action: 'withhold', reason: 'monto_distinto_tarifa' }
}

// Draw `amount` dollars of credit FIFO (oldest lote first) from a patient's open lotes.
// Returns dollars actually consumed. A freshly-inserted lote is newest, so it's only
// touched once the older lotes are exhausted (keeps a surplus lote intact on overpayment).
async function fifoConsumeLotes(supabase, patientId, amount) {
  let need = round2(amount)
  if (need <= EPS) return 0
  const { data: lotes, error } = await supabase
    .from('saldo_lotes').select('id, remaining, proof_id, aprobado_at, origin')
    .eq('patient_id', patientId).gt('remaining', 0)
    .order('created_at', { ascending: true }).order('id', { ascending: true })
  if (error) { console.error('[proof-auto] lotes load failed:', error.message); return 0 }
  let used = 0
  // #81: approved credit only, and never package credit (that is spent by the DB trigger,
  // one session at a time at the package price).
  for (const l of (lotes || []).filter((x) => loteGastable(x) && x.origin !== 'package')) {
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

// Returns 'inserted' | 'duplicate' | 'error'. saldo_lotes has a unique index on
// proof_id (supabase/saldo-lote-proof-unique.sql), so 'duplicate' means this proof
// was ALREADY applied by an earlier run — the caller must abort rather than carry
// on, because everything after the insert (the FIFO credit draw, the session mark)
// would otherwise run a second time.
//
// 2026-09-29: this is what happened to Andrea Torres. Proof d3cbbe00 was applied
// twice, so she got two $140 lotes AND two $39 draws against a single transfer.
async function insertLote(supabase, proof, ctx, lote) {
  const { error } = await supabase.from('saldo_lotes').insert({
    patient_id: proof.patient_id,
    payer_id: ctx.payerId ?? null,
    amount: lote.amount, price_per_session: lote.price_per_session, remaining: lote.amount,
    origin: lote.origin, proof_id: proof.id,
    // #77: lotes are only ever created by an approval in Comprobantes now.
    aprobado_por: ctx.aprobadoPor ?? null, aprobado_at: ctx.aprobadoAt ?? null,
    note: ctx.autoPackage ? `Paquete 4 × tarifa (regla #80) — comprobante ${proof.id}`
      : ctx.aprobadoAt ? `Aprobado por Nicolás — comprobante ${proof.id}` : `Auto — comprobante ${proof.id}`,
  })
  if (!error) return 'inserted'
  if (error.code === '23505' || /duplicate key|saldo_lotes_proof_id_unique/i.test(error.message || '')) {
    return 'duplicate'
  }
  console.error('[proof-auto] lote insert failed:', error.message)
  return 'error'
}

// Apply a plan (live). Mirrors updateSession's rules on the mark (stamps paid_at,
// refuses cancelled rows). Order for 'lote': insert first, then consume FIFO — so a
// package lote is used last (existing partial credit first) and an overpayment surplus
// lote is never drawn (need ≤ existing credit). Then mark sessions + stamp the proof.
async function applyPlan(supabase, proof, ctx, plan, now) {
  const iso = now.toISOString()
  // Already applied (a retry, or two overlapping cron runs picking up the same
  // proof). Everything below credits money or marks sessions paid, so re-running
  // it double-counts. The stamp is the cheap check; the unique index below is the
  // one that also closes the race two concurrent runs can win together.
  if (proof.reconciled_at) {
    console.warn(`[proof-auto] proof ${proof.id} already reconciled at ${proof.reconciled_at} — skipping`)
    return true
  }
  if (plan.action === 'lote') {
    const res = await insertLote(supabase, proof, ctx, plan.lote)
    if (res === 'error') return false
    if (res === 'duplicate') {
      console.warn(`[proof-auto] proof ${proof.id} already has a lote — already applied, skipping draw + mark`)
      return true
    }
  }
  if (plan.creditConsume > EPS) await fifoConsumeLotes(supabase, proof.patient_id, plan.creditConsume)
  if (plan.sessionIds?.length) {
    const { error: sErr } = await supabase
      .from('sessions')
      .update({ pagado: true, metodo_pago: plan.metodo, paid_at: iso, ...(plan.sessionMonto ? { monto: plan.sessionMonto } : {}) })
      .in('id', plan.sessionIds)
      .neq('estado', 'cancelada') // hard rule: a cancelled session is never pagado
    if (sErr) { console.error('[proof-auto] mark-paid failed:', sErr.message); return false }
  }
  const { error: rErr } = await supabase
    .from('whatsapp_messages')
    .update({
      reconciled_at: iso, reconciled_by: ctx.aprobadoPor ?? null, reconciled_session_ids: plan.sessionIds || [],
      auto_reconciled: !ctx.aprobadoAt || !!ctx.autoPackage,
      // A payer's proof attributed to their one owing patient (#61) is filed under that patient.
      ...(proof.attributedPatient ? { patient_id: proof.patient_id } : {}),
    })
    .eq('id', proof.id)
  if (rErr) { console.error('[proof-auto] reconcile-stamp failed:', rErr.message); return false }
  const tag = plan.action === 'lote' ? `lote ${plan.loteKind} $${plan.lote.amount}` : 'mark'
  console.log(`[proof-auto] proof ${proof.id} → ${tag}; sessions=${(plan.sessionIds || []).length} creditUsed=${plan.creditConsume || 0} (patient ${proof.patient_id}, ${plan.metodo})`)
  return true
}

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

// Is this transfer_id already recorded on a DIFFERENT comprobante? (reused reference)
// Only ~dozens of proofs ever carry a reference, so we read them and compare
// canonically in JS — PostgREST can't normalize inside the filter.
async function referenceReused(supabase, proof, transferId) {
  const target = normalizeReference(transferId)
  if (!target) return false
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('id, extracted')
    .not('extracted->>transfer_id', 'is', null)
    .neq('id', proof.id)
  if (error) { console.warn('[proof-auto] reused-ref check failed (treat as not reused):', error.message); return false }
  return (data || []).some((r) => normalizeReference(r?.extracted?.transfer_id) === target)
}

const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)
const samePhone = (a, b) => {
  const na = normalizePhone(a), nb = normalizePhone(b)
  return (na && na === nb) || (last9(a).length === 9 && last9(a) === last9(b))
}

// #61 — the proof's patient group: the matched patient (if any) plus every patient
// whose payer's telefono is the sender. `payers` = [{id,nombre,apellido,telefono}],
// `payerPatients` = patients with payer_id set. Returns { ids, payer }.
// #77: also every patient whose own telefono is the sender (shared-phone families).
export function proofPatientGroup(proof, payers, payerPatients, phonePatients = []) {
  const from = proof.raw_payload?.message?.from
  const ids = new Set(proof.patient_id ? [proof.patient_id] : [])
  const payer = from ? (payers || []).find((y) => y.telefono && samePhone(from, y.telefono)) || null : null
  if (payer) for (const p of payerPatients || []) if (p.payer_id === payer.id) ids.add(p.id)
  if (from) for (const p of phonePatients || []) if (p.telefono && samePhone(from, p.telefono)) ids.add(p.id)
  return { ids: [...ids], payer }
}

const PATIENT_COLS = 'id,nombre,apellido,nombre_2,tipo_paciente,metodo_pago,tarifa,payer_id,telefono'
const fmt$ = (n) => { const v = Number(n); return '$' + (Number.isInteger(v) ? v : v.toFixed(2)) }
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fechaCorta = (f) => { const [, m, d] = String(f).split('-').map(Number); return `${d} ${MESES[m - 1] || ''}` }

// Human description of a proposal (owner message + panel). `sessions` = the sessions
// the plan touches ({id,fecha,monto}).
export function describeProposal(plan, sessions = []) {
  if (!plan || plan.action === 'withhold' || plan.action === 'skip') return 'revisar a mano (no hay una asignación clara)'
  const byId = Object.fromEntries(sessions.map((s) => [s.id, s]))
  const marks = (plan.sessionIds || []).map((id) => byId[id]).filter(Boolean)
  const parts = []
  if (plan.action === 'lote') {
    const k = plan.loteKind === 'package' ? 'paquete' : plan.loteKind === 'prepay' ? 'pago adelantado' : 'sobrante'
    parts.push(`guardar ${fmt$(plan.lote.amount)} como saldo a favor (${k}, ${fmt$(plan.lote.price_per_session)}/sesión)`)
  }
  if (marks.length) {
    parts.push(`marcar pagada${marks.length > 1 ? 's' : ''} ${marks.map((s) => `${fechaCorta(s.fecha)} (${fmt$(s.monto)})`).join(', ')}` +
      (plan.creditConsume > EPS ? ` usando ${fmt$(plan.creditConsume)} de saldo a favor` : ''))
  }
  return parts.join(' + ') || 'revisar a mano'
}

// Load + evaluate recent unreconciled proofs. One shared evaluation for the cron, the
// dry run and approveProof, so an approval applies exactly what was proposed (re-derived
// from fresh data). Returns [{ proof, ex, status, gate, proposal, proposalCtx, sessions, group }].
async function evaluateProofs(supabase, { now, daysBack, onlyId = null, ocr = true }) {
  const today = gyeToday(now)
  const sinceMs = now.getTime() - daysBack * 864e5
  let q = supabase
    .from('whatsapp_messages')
    .select('id, patient_id, received_at, reconciled_at, alerted_at, raw_payload, extracted, extraction_status, propuesta,' +
      ` patient:patients(${PATIENT_COLS})`)
    .eq('direccion', 'inbound')
    .is('reconciled_at', null)
  q = onlyId ? q.eq('id', onlyId) : q.gte('received_at', new Date(sinceMs).toISOString())
  const { data: rows, error } = await q.order('received_at', { ascending: false })
  if (error) throw new Error('proofs query: ' + error.message)

  const proofs = (rows || [])
    .filter((r) => ['image', 'document'].includes(r.raw_payload?.message?.type))
    .filter((r) => onlyId || sentAtMs(r) >= sinceMs)

  // #61 payer receipts + #77 shared-phone families: each proof's patient group.
  const [{ data: payers, error: yErr }, { data: groupPatients, error: ppErr }] = await Promise.all([
    supabase.from('payers').select('id,nombre,apellido,telefono').not('telefono', 'is', null),
    supabase.from('patients').select(PATIENT_COLS).or('payer_id.not.is.null,telefono.not.is.null').eq('es_lead', false),
  ])
  if (yErr || ppErr) throw new Error('payers query: ' + (yErr || ppErr).message)
  const payerPatients = (groupPatients || []).filter((p) => p.payer_id)
  const patientById = Object.fromEntries((groupPatients || []).map((p) => [p.id, p]))
  for (const proof of proofs) {
    if (proof.patient) patientById[proof.patient.id] = proof.patient
    const g = proofPatientGroup(proof, payers, payerPatients, groupPatients)
    proof.groupIds = g.ids
    if (g.payer) proof.payerName = [g.payer.nombre, g.payer.apellido].filter(Boolean).join(' ') || null
  }

    // #81 A: receipts sent from Mariana's own number (her therapist row or her own
  // patient record) are forwards of someone else's payment → never automatic.
  const fromMariana = await marianaPhoneCheck(supabase, groupPatients)
  const guessPool = proofs.some((p) => fromMariana(p.raw_payload?.message?.from))
    ? await loadGuessPool(supabase) : []
  for (const proof of proofs) {
    if (!fromMariana(proof.raw_payload?.message?.from)) continue
    proof.fromMariana = true
    proof.nameCandidates = nameCandidates(proof.extracted, guessPool)
    for (const c of proof.nameCandidates) patientById[c.id] ||= c
  }

  // Unpaid confirmed sessions up to & including TODAY, oldest-first.
  const patientIds = [...new Set(proofs.flatMap((p) => [...p.groupIds, ...(p.nameCandidates || []).map((c) => c.id)]))]
  const byPatient = {}
  const creditByPatient = {}
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
    // Open saldo a favor — used ONLY by the proposal (never by the automatic gate).
    const { data: lotes, error: lErr } = await supabase
      .from('saldo_lotes').select('patient_id, remaining, proof_id, aprobado_at, origin')
      .in('patient_id', patientIds).gt('remaining', 0)
    if (lErr) throw new Error('lotes query: ' + lErr.message)
    // #81: approved, non-package credit only (packages are never mixed with cash).
    for (const l of (lotes || []).filter((x) => loteGastable(x) && x.origin !== 'package')) {
      creditByPatient[l.patient_id] = round2((creditByPatient[l.patient_id] || 0) + Number(l.remaining || 0))
    }
  }

  const out = []
  for (const proof of proofs) {
    // Ensure extraction — OCR only if never attempted (don't re-burn failed/needs_review).
    let status = proof.extraction_status
    let ex = proof.extracted
    if (ocr && (status == null || status === 'pending')) {
      const r = await ocrProofRow(supabase, proof, { force: false })
      status = r.status; ex = r.extracted
      proof.extraction_status = status; proof.extracted = ex
    }

    // ── #77 gate: the only automatic path ──
    const group = proof.groupIds.map((id) => ({ id, tarifa: patientById[id]?.tarifa, unpaid: byPatient[id] || [] }))
    let gate = decideAutoReconcile(proof, ex, group, { metodoPago: proof.patient?.metodo_pago })

    // ── #81 A: Mariana's number → ALWAYS held (even exact tarifa / 4 × tarifa). The
    // proposal targets the patient the receipt itself names, never Mariana's own record.
    if (proof.fromMariana && gate.action !== 'skip') {
      const g = precheck({ ...proof, patient_id: proof.patient_id || 'mariana' }, ex)
      gate = g && g.action === 'skip' ? g : { action: 'withhold', reason: 'remitente_mariana' }
      if (gate.action === 'withhold') {
        const real = pickRealPatient(proof.nameCandidates || [], ex, byPatient)
        const sessions = real ? byPatient[real.id] || [] : []
        let proposal = { action: 'withhold', reason: 'remitente_mariana' }
        if (real && ex?.amount != null) {
          // What the #77/#80 rule would do if the patient had sent it; else the pre-#77 proposal.
          const asOwn = decideAutoReconcile({ ...proof, patient_id: real.id }, ex,
            [{ id: real.id, tarifa: real.tarifa, unpaid: sessions }], { metodoPago: real.metodo_pago })
          if (asOwn.action === 'mark' || asOwn.action === 'lote') {
            const { autoPackage, ...plan } = asOwn
            proposal = plan
          } else {
            proposal = allocate({ ...proof, patient_id: real.id, patient: real }, ex, sessions, {
              credit: creditByPatient[real.id] || 0, tarifa: real.tarifa, payerId: real.payer_id || null,
            })
          }
          proposal.patientId = real.id
        }
        const guess = real ? null : (proof.nameCandidates || []).map(patientName).filter(Boolean)
        out.push({ proof, ex, status, gate, proposal, proposalCtx: {}, sessions, patientById,
          marianaGuess: { patientId: real?.id || null, posibles: guess } })
        continue
      }
    }

    // ── Proposal for a held receipt (pre-#77 rules, incl. #61 pooling) ──
    const pp = { ...proof }
    let pooled = false
    if (pp.groupIds.length > 1 || (pp.groupIds.length === 1 && !pp.patient_id)) {
      const owing = pp.groupIds.filter((id) => byPatient[id]?.length)
      const pick = owing.length === 1 ? owing[0] : (owing.length === 0 && pp.groupIds.length === 1 ? pp.groupIds[0] : null)
      if (pick && pick !== pp.patient_id) {
        pp.patient_id = pick
        pp.patient = patientById[pick] || pp.patient
      } else if (!pick && (owing.length > 1 || !pp.patient_id)) {
        pooled = true
        if (!pp.patient_id) pp.patient = patientById[owing[0] || pp.groupIds[0]] || null
      }
    }
    const unpaid = pooled
      ? pp.groupIds.flatMap((id) => byPatient[id] || []).sort((a, b) => (a.fecha > b.fecha ? 1 : a.fecha < b.fecha ? -1 : 0))
      : byPatient[pp.patient_id] || []
    const proposalCtx = {
      credit: pooled ? 0 : creditByPatient[pp.patient_id] || 0,
      tarifa: pp.patient?.tarifa,
      payerId: pp.patient?.payer_id || null,
    }
    let proposal = gate.action === 'skip' ? gate
      : proposeAllocation(pooled ? { ...pp, patient_id: pp.patient_id || pp.patient?.id } : pp, ex, unpaid, proposalCtx)
    if (pooled && proposal.action !== 'mark' && proposal.action !== 'skip' && proposal.action !== 'withhold') {
      proposal = { action: 'withhold', reason: 'payer_ambiguous' }
    }
    if (!pooled && pp.patient_id) proposal.patientId = pp.patient_id
    if (proposal.action === 'mark' && pooled && proposal.sessionIds?.length) {
      proposal.patientId = unpaid.find((s) => s.id === proposal.sessionIds[0])?.patient_id || pp.patient_id
    }
    const sessions = proof.groupIds.flatMap((id) => byPatient[id] || [])
    out.push({ proof, ex, status, gate, proposal, proposalCtx, sessions, patientById })
  }
  return out
}

// ── #81 A helpers ───────────────────────────────────────────────────────────
// Mariana's phones = every therapist named Mariana + her own patient record
// (Mariana Villegas, inactive). Returns a sender → boolean test on the last 9 digits.
async function marianaPhoneCheck(supabase, patients = []) {
  const { data: ther, error } = await supabase.from('therapists').select('id,nombre,telefono')
  if (error) console.warn('[proof-auto] therapists load failed (Mariana check uses patients only):', error.message)
  const phones = new Set([
    ...(ther || []).filter((t) => /^mariana\b/i.test(t.nombre || '')),
    ...(patients || []).filter((p) => /mariana/i.test(p.nombre || '') && /villegas/i.test(p.apellido || '')),
  ].map((r) => last9(r.telefono)).filter((x) => x.length === 9))
  return (from) => phones.has(last9(from))
}
export const _marianaPhoneCheck = marianaPhoneCheck

async function loadGuessPool(supabase) {
  const { data, error } = await supabase.from('patients')
    .select(PATIENT_COLS + ',apellido_2').eq('es_lead', false)
  if (error) { console.warn('[proof-auto] guess pool load failed:', error.message); return [] }
  // Never guess Mariana herself.
  return (data || []).filter((p) => !(/mariana/i.test(p.nombre || '') && /villegas/i.test(p.apellido || '')))
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const words = (s) => fold(s).split(/[^a-zñ]+/).filter((w) => w.length >= 3)

// Patients whose name appears in the receipt (sender name + bank description). A person
// counts when BOTH their first name and surname appear; best-scoring patients win.
export function nameCandidates(ex, pool = []) {
  const text = new Set([...words(ex?.sender_name), ...words(ex?.bank_description)])
  if (!text.size) return []
  const hit = (n, a) => {
    const nw = words(n), aw = words(a)
    return nw.length && aw.length && nw.some((w) => text.has(w)) && aw.some((w) => text.has(w))
      ? nw.filter((w) => text.has(w)).length + aw.filter((w) => text.has(w)).length : 0
  }
  const scored = pool.map((p) => ({ p, s: Math.max(hit(p.nombre, p.apellido), hit(p.nombre_2, p.apellido_2 || p.apellido)) }))
    .filter((x) => x.s > 0)
  const best = Math.max(0, ...scored.map((x) => x.s))
  return scored.filter((x) => x.s === best).map((x) => x.p)
}

// One candidate → it. Several → narrow by tarifa = amount, then by an unpaid session on the
// transfer date. Still several (or none) → null: Nicolás picks by hand.
export function pickRealPatient(cands, ex, byPatient = {}) {
  let c = cands
  if (c.length > 1 && ex?.amount != null) {
    const t = c.filter((p) => same(Number(p.tarifa || 0), Number(ex.amount)))
    if (t.length) c = t
  }
  if (c.length > 1 && ex?.transfer_date) {
    const d = c.filter((p) => (byPatient[p.id] || []).some((s) => s.fecha === ex.transfer_date))
    if (d.length) c = d
  }
  return c.length === 1 ? c[0] : null
}

// What the panel stores for a held receipt (whatsapp_messages.propuesta).
function proposalRecord(e, motivo) {
  const p = e.proposal
  if (e.marianaGuess) {
    const pat = e.marianaGuess.patientId ? e.patientById[e.marianaGuess.patientId] : null
    const touched = new Set(p.sessionIds || [])
    const pos = e.marianaGuess.posibles || []
    return {
      motivo, remitente: 'Mariana',
      accion: p.action, patient_id: pat?.id || null, paciente: patientName(pat), tarifa: pat?.tarifa ?? null,
      monto: e.ex?.amount ?? null, session_ids: p.sessionIds || [],
      sesiones: e.sessions.filter((s) => touched.has(s.id)).map((s) => ({ id: s.id, fecha: s.fecha, monto: Number(s.monto) })),
      credito_usado: p.creditConsume || 0, lote: p.lote || null, metodo: p.metodo || null,
      texto: pat ? `según el comprobante es de ${patientName(pat)}: ${describeProposal(p, e.sessions)}`
        : pos.length ? `no se pudo decidir el paciente (posibles: ${pos.join(', ')}) — elige a mano`
          : 'el comprobante no nombra a un paciente conocido — elige a mano',
    }
  }
  const pid = p.patientId || e.proof.patient_id || e.proof.groupIds?.[0] || null
  const pat = pid ? e.patientById[pid] : null
  const touched = new Set(p.sessionIds || [])
  return {
    motivo,
    accion: p.action, // 'mark' | 'lote' | 'withhold' (nothing to approve automatically)
    patient_id: pid, paciente: patientName(pat), tarifa: pat?.tarifa ?? null,
    monto: e.ex?.amount ?? null,
    session_ids: p.sessionIds || [],
    sesiones: e.sessions.filter((s) => touched.has(s.id)).map((s) => ({ id: s.id, fecha: s.fecha, monto: Number(s.monto) })),
    credito_usado: p.creditConsume || 0,
    lote: p.lote || null,
    metodo: p.metodo || null,
    texto: describeProposal(p, e.sessions),
  }
}

// Orchestrator. Options: { now, live, daysBack }.
//   • live=false → dry: OCR + decide, but mark/reconcile/notify NOTHING (preview).
//   • live=true  → apply the #77 automatic marks; hold the rest + tell Nicolás once.
export async function runProofAutomation(supabase, { now = new Date(), live = false, daysBack = 7, deps = {} } = {}) {
  const notify = deps.notifyOwner || notifyOwner
  const evals = await evaluateProofs(supabase, { now, daysBack })
  const report = { today: gyeToday(now), live: !!live, marked: 0, lotes: 0, withheld: 0, alerted: 0, failed: 0, items: [] }
  for (const e of evals) {
    const { proof, ex, status } = e
    let plan = e.gate
    // Reused-reference is ALWAYS a hold (spec #2: suspicion).
    if ((plan.action === 'mark' || plan.action === 'lote') && await referenceReused(supabase, proof, ex?.transfer_id)) {
      plan = { action: 'withhold', reason: 'reused_reference' }
    }
    const markPid = plan.action === 'mark' || plan.action === 'lote' ? plan.patientId : null
    const markPatient = markPid ? e.patientById[markPid] : proof.patient
    const item = {
      proofId: proof.id, patient: patientName(markPatient) || patientName(proof.patient), patientId: markPid || proof.patient_id || null,
      amount: ex?.amount ?? null, tarifa: markPatient?.tarifa ?? proof.patient?.tarifa ?? null,
      transferId: ex?.transfer_id || null, extraction: status,
      action: plan.action, reason: plan.reason || null,
      sessionIds: plan.sessionIds || null, metodo: plan.metodo || null,
      loteKind: null, loteAmount: null, creditConsume: 0,
    }
    if (plan.action === 'mark' || plan.action === 'lote') {
      const target = { ...proof, patient_id: markPid, attributedPatient: markPid !== proof.patient_id }
      // #80: the 4 × tarifa package lote is approved by the rule (aprobado_at, no aprobado_por).
      const ctx = { payerId: e.patientById[markPid]?.payer_id || null, ...(plan.autoPackage ? { aprobadoAt: now.toISOString(), autoPackage: true } : {}) }
      item.loteAmount = plan.lote?.amount ?? null
      const ok = live ? await applyPlan(supabase, target, ctx, plan, now) : true
      if (!ok) { item.action = 'failed'; report.failed++ } else { if (plan.action === 'lote') report.lotes++; if (plan.sessionIds?.length) report.marked++ }
    } else if (plan.action === 'withhold') {
      report.withheld++
      item.motivo = motivoFor(plan.reason)
      const rec = proposalRecord(e, item.motivo)
      item.propuesta = rec
      if (live) {
        const { error: pErr } = await supabase.from('whatsapp_messages')
          .update({ propuesta: rec, propuesta_at: now.toISOString() }).eq('id', proof.id)
        if (pErr) console.error('[proof-auto] propuesta stamp failed:', pErr.message)
      }
      // Tell Nicolás ONCE per held receipt (alerted_at throttles the */10 re-runs).
      if (!proof.alerted_at) {
        item.alert = live ? 'sending' : 'would-alert'
        if (live) {
          const who = rec.paciente || (proof.fromMariana ? ex?.sender_name || 'paciente sin identificar' : alertSender(proof, ex))
          const by = proof.fromMariana ? 'Mariana' : proof.payerName
          const body = `Comprobante en espera: ${who}` +
            `${by && by !== who ? ` (enviado por ${by})` : ''}` +
            ` pagó ${ex?.amount != null ? fmt$(ex.amount) : '¿monto?'}` +
            `${rec.tarifa != null ? `, tarifa ${fmt$(rec.tarifa)}` : ''}.\nMotivo: ${item.motivo}.\n` +
            `Propuesta: ${rec.texto}.\nApruébalo o corrígelo en el panel → Comprobantes.`
          try {
            await notify(supabase, { kind: 'comprobante_pendiente', resumen: `Comprobante en espera: ${who}`.slice(0, 90), messages: [{ type: 'text', body }] })
            const { error: aErr } = await supabase
              .from('whatsapp_messages').update({ alerted_at: now.toISOString() }).eq('id', proof.id)
            if (aErr) { console.error('[proof-auto] alert-stamp failed:', aErr.message); item.alert = 'sent_stamp_failed' }
            else { item.alert = 'sent'; report.alerted++ }
          } catch (err) {
            console.error(`[proof-auto] notifyOwner failed for proof ${proof.id}:`, err.message)
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

// Nicolás approves a held receipt's proposal in Comprobantes. Re-derives the proposal
// from fresh data (sessions may have changed since it was held) and applies it through
// the same applyPlan as the automatic match; a lote it banks is stamped approved.
// Returns { ok, error?, plan }.
export async function approveProof(supabase, proofId, { userId, now = new Date() } = {}) {
  const evals = await evaluateProofs(supabase, { now, daysBack: 60, onlyId: proofId, ocr: false })
  const e = evals[0]
  if (!e) return { ok: false, error: 'El comprobante ya no está pendiente.' }
  const plan = e.proposal
  if (plan.action !== 'mark' && plan.action !== 'lote') {
    return { ok: false, error: 'Este comprobante no tiene una propuesta automática: elige las sesiones a mano.' }
  }
  const pid = plan.patientId || e.proof.patient_id
  if (!pid) return { ok: false, error: 'No se sabe a qué paciente corresponde.' }
  if (await referenceReused(supabase, e.proof, e.ex?.transfer_id)) {
    return { ok: false, error: 'La referencia de este comprobante ya se usó en otro. Revísalo a mano.' }
  }
  const target = { ...e.proof, patient_id: pid, attributedPatient: pid !== e.proof.patient_id }
  const ctx = { payerId: e.patientById[pid]?.payer_id || null, aprobadoPor: userId || null, aprobadoAt: now.toISOString() }
  const ok = await applyPlan(supabase, target, ctx, plan, now)
  return ok ? { ok: true, plan: { ...plan, texto: describeProposal(plan, e.sessions) } } : { ok: false, error: 'No se pudo aplicar el pago.' }
}
