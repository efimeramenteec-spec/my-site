// scripts/harness-comprobantes-83.mjs
//
// #83 harness — repeated receipts never reach the approval list; a reference is applied once.
// Fake in-memory DB, NOTHING is sent (notifyOwner stubbed).
//   node scripts/harness-comprobantes-83.mjs

import { runProofAutomation, approveProof, repeatVerdict, samePersonActive } from '../netlify/lib/proofReconcile.mjs'

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
          if (db.failRefs && t === 'whatsapp_messages' && op === 'select' && /reconciled_at, cierre, extracted/.test(cols)) {
            return Promise.resolve({ data: null, error: { message: 'simulated outage' } }).then(res, rej)
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


const NOW = new Date('2026-10-22T17:00:00Z')
const ts = (iso) => String(Math.floor(new Date(iso).getTime() / 1000))
let n = 0
function proofRow({ patient_id, from, amount, ref, sent = '2026-10-22T15:00:00Z', applied = false, cierre = null, dest = 'pichincha' }) {
  n++
  return {
    id: `proof-${n}`, patient_id, direccion: 'inbound', received_at: sent,
    reconciled_at: applied || cierre ? '2026-10-01T00:00:00Z' : null, cierre, alerted_at: null, propuesta: null,
    raw_payload: { message: { type: 'image', from, timestamp: ts(sent) } },
    extraction_status: 'ok',
    extracted: { is_payment_proof: true, amount, confidence: 'high', recipient_name: 'Mariana Villegas', destination: dest, transfer_id: ref },
  }
}
const sess = (id, patient_id, fecha, monto = 39) => ({ id, patient_id, fecha, monto, estado: 'confirmada', pagado: false, tipo: 'individual' })
const ANA = { id: 'ana', nombre: 'Ana', apellido: 'Test', tarifa: 39, payer_id: null, telefono: '+593990000001', metodo_pago: 'transferencia', es_lead: false, estado_general: 'activo' }

let failures = 0
const out = []
const check = (label, cond, detail = '') => { out.push(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!cond) failures++ }
async function run(db, live = true) {
  const notified = []
  const report = await runProofAutomation(db, { now: NOW, live, deps: { notifyOwner: async (_s, m) => { notified.push(m); return { via: 'stub' } } } })
  return { report, notified }
}
const W = (db, id) => db.tables.whatsapp_messages.find((r) => r.id === id)

// 1. Same reference again after it was APPLIED → closed as a repeat, silently.
{
  const orig = proofRow({ patient_id: 'ana', from: '593990000001', amount: 39, ref: '0052217700', sent: '2026-09-29T15:00:00Z', applied: true })
  const again = proofRow({ patient_id: 'ana', from: '593990000001', amount: 39, ref: '52217700' })
  const db = fakeDb({ patients: [ANA], payers: [], sessions: [sess('s1', 'ana', '2026-10-15')], saldo_lotes: [], whatsapp_messages: [orig, again] })
  const r = await run(db)
  const w = W(db, again.id)
  check('applied ref sent again → closed duplicado', w.cierre === 'duplicado' && !!w.reconciled_at, w.cierre_nota)
  check('… note says "duplicado de 29 sep"', w.cierre_nota === 'duplicado de 29 sep', w.cierre_nota)
  check('… nothing paid, no proposal, no owner message', !db.tables.sessions[0].pagado && !w.propuesta && r.notified.length === 0)
}
// 2. Three copies of a receipt not applied yet → ONE pending (the first), two closed as copies; approve the original works.
{
  const mk = (sent) => proofRow({ patient_id: 'ana', from: '593990000001', amount: 78, ref: '5076515', sent })
  const a = mk('2026-10-20T15:00:00Z'), b = mk('2026-10-21T15:00:00Z'), c = mk('2026-10-21T16:00:00Z')
  const db = fakeDb({ patients: [ANA], payers: [], sessions: [sess('s1', 'ana', '2026-10-10'), sess('s2', 'ana', '2026-10-14')], saldo_lotes: [], whatsapp_messages: [c, b, a] })
  const r = await run(db)
  const pending = db.tables.whatsapp_messages.filter((x) => !x.reconciled_at)
  check('3 copies before approval → 1 pending', pending.length === 1 && pending[0].id === a.id, pending.map((x) => x.id).join())
  check('… the other 2 closed as copia', [b, c].every((x) => W(db, x.id).cierre === 'copia'), W(db, b.id).cierre_nota)
  check('… one owner message only', r.notified.length === 1)
  const ap = await approveProof(db, a.id, { userId: 'owner', now: NOW })
  check('approve the original → works (copies don\'t count as "used")', ap.ok && db.tables.sessions.every((s) => s.pagado), ap.error)
  const r2 = await run(db)
  check('re-run after approval → nothing new, no message', r2.notified.length === 0 && db.tables.whatsapp_messages.filter((x) => !x.reconciled_at).length === 0)
}
// 2b. Approve while copies are still pending (cron hasn't run) → the copies close as duplicados right away.
{
  const mk = (sent) => proofRow({ patient_id: 'ana', from: '593990000001', amount: 78, ref: 'R2B', sent })
  const a = mk('2026-10-20T15:00:00Z'), b = mk('2026-10-21T15:00:00Z')
  a.propuesta = { accion: 'mark' }
  const db = fakeDb({ patients: [ANA], payers: [], sessions: [sess('s1', 'ana', '2026-10-10'), sess('s2', 'ana', '2026-10-14')], saldo_lotes: [], whatsapp_messages: [a, b] })
  const ap = await approveProof(db, a.id, { userId: 'owner', now: NOW })
  check('approve with a pending copy → copy closed duplicado', ap.ok && W(db, b.id).cierre === 'duplicado', ap.error || W(db, b.id).cierre_nota)
}
// 3. The reference check itself errors → HOLD (never "treat as not reused").
{
  const p = proofRow({ patient_id: 'ana', from: '593990000001', amount: 39, ref: 'X1' })
  const db = fakeDb({ patients: [ANA], payers: [], sessions: [sess('s1', 'ana', '2026-10-15')], saldo_lotes: [], whatsapp_messages: [p] })
  db.failRefs = true
  const r = await run(db)
  check('ref check error + exact tarifa → held, nothing paid', r.report.items[0]?.action === 'withhold' && r.report.items[0]?.reason === 'ref_check_failed' && !db.tables.sessions[0].pagado,
    `${r.report.items[0]?.action}/${r.report.items[0]?.reason}`)
  const ap = await approveProof(db, p.id, { userId: 'owner', now: NOW })
  check('ref check error on approve → refused, nothing paid', !ap.ok && !db.tables.sessions[0].pagado, ap.error)
  db.failRefs = false
  const r2 = await run(db)
  check('… check back up → $39 exact auto-applies', db.tables.sessions[0].pagado, r2.report.items[0]?.action)
}
// 4. Applied ref with a DIFFERENT amount → not a repeat, but still held as reused reference (auto never applies it).
{
  const orig = proofRow({ patient_id: 'ana', from: '593990000001', amount: 50, ref: 'R4', applied: true, sent: '2026-10-01T15:00:00Z' })
  const p = proofRow({ patient_id: 'ana', from: '593990000001', amount: 39, ref: 'R4' })
  const db = fakeDb({ patients: [ANA], payers: [], sessions: [sess('s1', 'ana', '2026-10-15')], saldo_lotes: [], whatsapp_messages: [orig, p] })
  const r = await run(db)
  check('same ref, other amount → not closed, held reused_reference', !W(db, p.id).cierre && r.report.items[0]?.reason === 'reused_reference', r.report.items[0]?.reason)
  check('… repeatVerdict pure: other amount → null', repeatVerdict(p, p.extracted, db.tables.whatsapp_messages) === null)
}
// 5. Copy of a receipt Nicolás ignored → closed ignorado.
{
  const ig = proofRow({ patient_id: 'ana', from: '593990000001', amount: 7.25, ref: 'R5', cierre: 'ignorado', sent: '2026-10-21T15:00:00Z' })
  const p = proofRow({ patient_id: 'ana', from: '593990000001', amount: 7.25, ref: 'R5' })
  const db = fakeDb({ patients: [ANA], payers: [], sessions: [], saldo_lotes: [], whatsapp_messages: [ig, p] })
  const r = await run(db)
  check('copy of an ignored receipt → closed ignorado, no message', W(db, p.id).cierre === 'ignorado' && r.notified.length === 0, W(db, p.id).cierre_nota)
}
// 6. Same person: Karina's old (inactive) number, nothing unpaid → proposal on Camila's active record.
{
  const KOLD = { id: 'kold', nombre: 'Karina', apellido: 'Almache', tipo_paciente: 'individual', tarifa: 35, payer_id: null, telefono: '+593994768719', es_lead: false, estado_general: 'inactivo' }
  const KCAM = { id: 'kcam', nombre: 'Karina', apellido: 'Almache', nombre_2: 'Camila', apellido_2: 'Mena', tipo_paciente: 'menor', tarifa: 35, payer_id: null, telefono: '+34610372877', es_lead: false, estado_general: 'activo' }
  const p = proofRow({ patient_id: 'kold', from: '593994768719', amount: 35, ref: 'K1' })
  const db = fakeDb({ patients: [KOLD, KCAM], payers: [], sessions: [sess('c15', 'kcam', '2026-10-15', 35)], saldo_lotes: [], whatsapp_messages: [p] })
  const r = await run(db)
  const pr = W(db, p.id).propuesta
  check('Karina old number → held (never auto)', r.report.items[0]?.action === 'withhold' && !db.tables.sessions[0].pagado)
  check('… proposal on Camila\'s record, 15 Oct', pr?.patient_id === 'kcam' && pr?.session_ids?.join() === 'c15' && pr?.accion === 'mark', pr?.texto)
  check('… no prepay lote proposed', !pr?.lote)
  const ap = await approveProof(db, p.id, { userId: 'owner', now: NOW })
  check('approve → Camila 15 Oct paid, proof filed under her', ap.ok && db.tables.sessions[0].pagado && W(db, p.id).patient_id === 'kcam', ap.error)
  check('samePersonActive: payer with same name → their active patient', samePersonActive(KOLD, [{ id: 'x', nombre: 'Leo', apellido: 'Mena', payer_id: 'py' }], [{ id: 'py', nombre: 'Karina', apellido: 'Almache' }]).length === 1)
  // Inactive record that still owes → no redirect.
  const db2 = fakeDb({ patients: [KOLD, KCAM], payers: [], sessions: [sess('o1', 'kold', '2026-10-01', 35), sess('c15', 'kcam', '2026-10-15', 35)], saldo_lotes: [],
    whatsapp_messages: [proofRow({ patient_id: 'kold', from: '593994768719', amount: 50, ref: 'K2' })] })
  await run(db2)
  check('inactive record that owes → proposal stays on it', db2.tables.whatsapp_messages[0].propuesta?.patient_id === 'kold')
}

console.log(out.join('\n'))
console.log(failures ? `\n${failures} FAILED` : `\nall ${out.length} passed`)
process.exit(failures ? 1 : 0)
