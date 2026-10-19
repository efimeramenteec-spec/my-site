// scripts/harness-comprobantes-77.mjs
//
// #77 harness — fake in-memory DB, NOTHING is sent (notifyOwner is stubbed).
// Rule: a receipt auto-applies ONLY when amount == patients.tarifa AND the patient has
// an unpaid session; everything else is held with a proposal, no lote created.
//   node scripts/harness-comprobantes-77.mjs

import { runProofAutomation, approveProof } from '../netlify/lib/proofReconcile.mjs'
import { loteAprobado } from '../netlify/lib/saldo.mjs'

// ── Minimal PostgREST-ish fake ───────────────────────────────────────────────
function get(row, col) {
  if (col.includes('->>')) { const [a, b] = col.split('->>'); return row[a]?.[b] ?? null }
  return row[col]
}
function fakeDb(tables) {
  const db = { tables, notified: [] }
  db.from = (t) => {
    const rows = () => (tables[t] ||= [])
    const filters = []
    let op = 'select', patch = null, inserted = null, cols = '*'
    const q = {
      select(c) { if (op === 'select') cols = c; return q },
      eq(c, v) { filters.push((r) => get(r, c) === v); return q },
      neq(c, v) { filters.push((r) => get(r, c) !== v); return q },
      is(c, v) { filters.push((r) => (get(r, c) ?? null) === v); return q },
      not(c, o, v) { filters.push((r) => (get(r, c) ?? null) !== v); return q },
      in(c, vs) { filters.push((r) => vs.includes(get(r, c))); return q },
      gte(c, v) { filters.push((r) => get(r, c) >= v); return q },
      lte(c, v) { filters.push((r) => get(r, c) <= v); return q },
      gt(c, v) { filters.push((r) => Number(get(r, c)) > v); return q },
      or() { return q },
      order() { return q },
      limit() { return q },
      single() { return q.then((r) => ({ data: r.data?.[0] || null, error: r.error })) },
      update(p) { op = 'update'; patch = p; return q },
      insert(r) { op = 'insert'; inserted = r; return q },
      then(res, rej) {
        try {
          if (op === 'insert') {
            const list = Array.isArray(inserted) ? inserted : [inserted]
            for (const r of list) {
              if (t === 'saldo_lotes' && r.proof_id && rows().some((x) => x.proof_id === r.proof_id)) {
                return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } }).then(res, rej)
              }
              rows().push({ id: `${t}-${rows().length + 1}`, created_at: new Date().toISOString(), ...r })
            }
            return Promise.resolve({ data: list, error: null }).then(res, rej)
          }
          const hit = rows().filter((r) => filters.every((f) => f(r)))
          if (op === 'update') { for (const r of hit) Object.assign(r, patch); return Promise.resolve({ data: hit, error: null }).then(res, rej) }
          // Embed the patient join for whatsapp_messages.
          const out = hit.map((r) => (t === 'whatsapp_messages' && cols.includes('patient:')
            ? { ...r, patient: (tables.patients || []).find((p) => p.id === r.patient_id) || null } : { ...r }))
          return Promise.resolve({ data: out, error: null }).then(res, rej)
        } catch (e) { return Promise.reject(e).then(res, rej) }
      },
    }
    return q
  }
  return db
}

const NOW = new Date('2026-10-19T17:00:00Z')
let n = 0
function proofRow({ patient_id = null, from, amount, status = 'ok', ref }) {
  n++
  return {
    id: `proof-${n}`, patient_id, direccion: 'inbound', received_at: '2026-10-19T16:00:00Z',
    reconciled_at: null, alerted_at: null, propuesta: null,
    raw_payload: { message: { type: 'image', from, timestamp: String(Math.floor(NOW.getTime() / 1000) - 3600) } },
    extraction_status: status,
    extracted: status === 'ok' ? { is_payment_proof: true, amount, confidence: 'high', recipient_name: 'Mariana Villegas',
      destination: 'Banco Pichincha', transfer_id: ref || `REF${n}` } : null,
  }
}
const sess = (id, patient_id, fecha, monto = 39) =>
  ({ id, patient_id, fecha, monto, estado: 'confirmada', pagado: false, tipo: 'individual' })

function scenario(name, { patients, payers = [], sessions, lotes = [], proof }) {
  const db = fakeDb({ patients, payers, sessions, saldo_lotes: lotes, whatsapp_messages: [proof] })
  return { name, db, proof }
}

const ANA = { id: 'ana', nombre: 'Ana', apellido: 'Test', tarifa: 39, payer_id: null, telefono: '+593990000001', metodo_pago: 'transferencia', es_lead: false }
const base = (amount, extra = {}) => scenario(`$${amount} for a $39-rate patient`, {
  patients: [ANA], sessions: [sess('s1', 'ana', '2026-10-10'), sess('s2', 'ana', '2026-10-14')],
  lotes: [{ id: 'l0', patient_id: 'ana', remaining: 1, proof_id: 'old', aprobado_at: null, created_at: '2026-10-06' }],
  proof: proofRow({ patient_id: 'ana', from: '593990000001', amount, ...extra }),
})

const cases = []
let failures = 0
function check(label, cond, detail = '') {
  cases.push(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

async function run(sc) {
  const notified = []
  const report = await runProofAutomation(sc.db, { now: NOW, live: true, deps: { notifyOwner: async (_s, m) => { notified.push(m); return { via: 'stub' } } } })
  return { report, notified, item: report.items[0], tables: sc.db.tables }
}

// 1. $39 exact → auto, oldest session, no lote, no credit drawn.
{
  const r = await run(base(39))
  const s1 = r.tables.sessions.find((s) => s.id === 's1'), s2 = r.tables.sessions.find((s) => s.id === 's2')
  check('$39 → auto-mark oldest unpaid', r.item.action === 'mark' && s1.pagado && !s2.pagado, `action=${r.item.action}`)
  check('$39 → no new lote, $1 credit untouched', r.tables.saldo_lotes.length === 1 && r.tables.saldo_lotes[0].remaining === 1)
  check('$39 → no owner message', r.notified.length === 0)
}
// 2-5. $40, $38, $78, unreadable → held, no lote, nothing paid, one notifyOwner.
for (const [label, sc] of [['$40', base(40)], ['$38', base(38)], ['$78', base(78)], ['unreadable', base(null, { status: 'failed' })]]) {
  const r = await run(sc)
  const paid = r.tables.sessions.filter((s) => s.pagado).length
  check(`${label} → held`, r.item.action === 'withhold', `reason=${r.item.reason}`)
  check(`${label} → nothing paid, no lote`, paid === 0 && r.tables.saldo_lotes.length === 1)
  check(`${label} → one notifyOwner 'comprobante_pendiente'`, r.notified.length === 1 && r.notified[0].kind === 'comprobante_pendiente')
  check(`${label} → proposal stored`, !!sc.db.tables.whatsapp_messages[0].propuesta, sc.db.tables.whatsapp_messages[0].propuesta?.texto)
  // Re-run: no second message.
  const again = await run(sc)
  check(`${label} → re-run does not re-notify`, again.notified.length === 0)
}
// 6. $39 but no unpaid session → held, no prepay lote.
{
  const sc = scenario('$39 no debt', { patients: [ANA], sessions: [], proof: proofRow({ patient_id: 'ana', from: '593990000001', amount: 39 }) })
  const r = await run(sc)
  check('$39 with no unpaid session → held, no lote', r.item.action === 'withhold' && r.tables.saldo_lotes.length === 0, `reason=${r.item.reason}`)
}
// 7. $140 package → held (no auto package any more), proposal = package lote.
{
  const sc = base(140)
  const r = await run(sc)
  check('$140 → held, no lote', r.item.action === 'withhold' && r.tables.saldo_lotes.length === 1)
  check('$140 → proposal is the package', sc.db.tables.whatsapp_messages[0].propuesta?.lote?.origin === 'package', sc.db.tables.whatsapp_messages[0].propuesta?.texto)
}
// 8. Payer group: Shariam (payer, own patient $39) + Marthin ($45 rate). $45 from payer phone → Marthin's oldest.
{
  const SHA = { id: 'sha', nombre: 'Shariam', apellido: 'N', tarifa: 39, payer_id: 'pay', telefono: '+593995879307', es_lead: false }
  const MAR = { id: 'mar', nombre: 'Shariam', nombre_2: 'Marthin', apellido: 'N', tarifa: 45, payer_id: 'pay', telefono: null, es_lead: false }
  const mk = (amount) => scenario('payer group', {
    patients: [SHA, MAR], payers: [{ id: 'pay', nombre: 'Shariam', apellido: 'N', telefono: '+593995879307' }],
    sessions: [sess('sh1', 'sha', '2026-10-14', 39), sess('ma1', 'mar', '2026-10-16', 45), sess('ma0', 'mar', '2026-10-09', 45)],
    proof: proofRow({ patient_id: null, from: '593995879307', amount }),
  })
  let r = await run(mk(45))
  const paid = r.tables.sessions.filter((s) => s.pagado).map((s) => s.id)
  check('payer $45 → Marthin\'s oldest (9 Oct) auto', r.item.action === 'mark' && paid.join() === 'ma0', `paid=${paid}`)
  check('payer $45 → proof filed under Marthin', r.tables.whatsapp_messages[0].patient_id === 'mar')
  r = await run(mk(39))
  check('payer $39 → Shariam\'s 14 Oct auto', r.item.action === 'mark' && r.tables.sessions.find((s) => s.id === 'sh1').pagado)
  r = await run(mk(84))
  check('payer $84 (both) → held, nothing paid', r.item.action === 'withhold' && !r.tables.sessions.some((s) => s.pagado))
}
// 9. Approval path: held $78 → approve → both sessions paid through applyPlan; held $80 → lote stamped approved.
{
  const sc = base(78)
  await run(sc)
  const a = await approveProof(sc.db, sc.proof.id, { userId: 'owner-uid', now: NOW })
  const paid = sc.db.tables.sessions.filter((s) => s.pagado).length
  check('approve held $78 → both sessions paid, no lote, auto $1 untouched', a.ok && paid === 2 &&
    sc.db.tables.saldo_lotes.length === 1 && sc.db.tables.saldo_lotes[0].remaining === 1, a.error || a.plan?.texto)
  check('approve → proof reconciled, not auto', !!sc.db.tables.whatsapp_messages[0].reconciled_at && sc.db.tables.whatsapp_messages[0].auto_reconciled === false)
  const sc2 = base(80)
  await run(sc2)
  const a2 = await approveProof(sc2.db, sc2.proof.id, { userId: 'owner-uid', now: NOW })
  const newLote = sc2.db.tables.saldo_lotes.find((l) => l.proof_id === sc2.proof.id)
  check('approve held $80 → lote created + stamped aprobado', a2.ok && newLote?.aprobado_por === 'owner-uid' && !!newLote?.aprobado_at,
    `${a2.plan?.texto}; lote=${newLote?.amount}`)
  check('approve $80 → surplus is $2 (unapproved $1 not used)', newLote?.amount === 2)
}
// 10. Reminder credit filter.
check('reminders: auto lote not counted', loteAprobado({ proof_id: 'x', aprobado_at: null }) === false)
check('reminders: approved lote counted', loteAprobado({ proof_id: 'x', aprobado_at: '2026-10-19' }) === true)
check('reminders: hand-made lote counted', loteAprobado({ proof_id: null, aprobado_at: null }) === true)

console.log(cases.join('\n'))
console.log(failures ? `\n${failures} FAILED` : `\nall ${cases.length} passed`)
process.exit(failures ? 1 : 0)
