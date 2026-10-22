// Harness for #86 C (lib/reminderSends.mjs): a failed reminder must not count as sent.
// Everything is in memory (repo stub). Run: node scripts/harness-recordatorio-fallido-86.mjs
import assert from 'node:assert/strict'
import { wamidOf, logReminderSend, failedBefore, reconcileReminderFailures } from '../netlify/lib/reminderSends.mjs'

const NOW = new Date('2026-10-22T20:00:00Z')
function world({ sends = [], statuses = [], sessions = [] } = {}) {
  const db = { sends: structuredClone(sends), statuses, sessions: structuredClone(sessions) }
  const owner = []
  const repo = {
    async insertSend(row) { db.sends.push({ id: `rs${db.sends.length + 1}`, failed_at: null, sent_at: NOW.toISOString(), ...row }) },
    async failedSends({ kind, telefono }) { return db.sends.filter((s) => s.kind === kind && s.telefono === telefono && s.failed_at) },
    async unreconciled({ wamids, since }) {
      return db.sends.filter((s) => !s.failed_at && s.wamid && (wamids ? wamids.includes(s.wamid) : s.sent_at >= since))
    },
    async failedStatuses(w) { return db.statuses.filter((x) => x.status === 'failed' && w.includes(x.wamid)) },
    async clearStamp(kind, ids) {
      const col = kind === 'pago' ? 'recordatorio_pago_at' : 'reminder_sent_at'
      for (const s of db.sessions) if (ids.includes(s.id)) s[col] = null
    },
    async claimFailed(id, { at, error }) {
      const s = db.sends.find((x) => x.id === id)
      if (s.failed_at) return false
      Object.assign(s, { failed_at: at, error, owner_notified_at: at }); return true
    },
    async patientName(id) { return id === 'p1' ? 'Emily Rivera' : null },
  }
  const notifyOwner = async (o) => { owner.push(o) }
  return { db, owner, repo, notifyOwner }
}

const results = []
const t = async (name, fn) => { try { await fn(); results.push(`PASS ${name}`) } catch (e) { results.push(`FAIL ${name}: ${e.message}`); process.exitCode = 1 } }

await t('wamidOf reads the Cloud API response', async () => {
  assert.equal(wamidOf({ messages: [{ id: 'wamid.X' }] }), 'wamid.X')
  assert.equal(wamidOf(null), null)
})

await t('accepted send is logged with its wamid + sessions', async () => {
  const w = world()
  await logReminderSend(w.repo, { kind: 'pago', resp: { messages: [{ id: 'wamid.A' }] }, patientId: 'p1', sessionIds: ['s1', 's2'], telefono: '+61433182326' })
  assert.deepEqual(w.db.sends.map((s) => [s.kind, s.wamid, s.session_ids]), [['pago', 'wamid.A', ['s1', 's2']]])
})

await t('log failure never throws (send already happened)', async () => {
  const w = world(); w.repo.insertSend = async () => { throw new Error('db down') }
  await logReminderSend(w.repo, { kind: 'cita', resp: {}, patientId: null, sessionIds: ['s1'], telefono: '+1' })
})

const base = {
  sends: [
    { id: 'rs1', kind: 'pago', wamid: 'wamid.F', patient_id: 'p1', session_ids: ['s1', 's2'], telefono: '+593433182326', sent_at: '2026-10-20T15:00:00Z', failed_at: null },
    { id: 'rs2', kind: 'cita', wamid: 'wamid.OK', patient_id: 'p2', session_ids: ['s3'], telefono: '+593981673717', sent_at: '2026-10-20T15:00:00Z', failed_at: null },
    { id: 'rs3', kind: 'cita', wamid: 'wamid.C', patient_id: 'p1', session_ids: ['s4'], telefono: '+593433182326', sent_at: '2026-10-21T15:00:00Z', failed_at: null },
  ],
  statuses: [
    { wamid: 'wamid.F', status: 'sent' }, { wamid: 'wamid.F', status: 'failed', error_code: 131026, error_title: 'Message undeliverable' },
    { wamid: 'wamid.OK', status: 'delivered' },
    { wamid: 'wamid.C', status: 'failed', error_code: 131049, error_title: 'Ecosystem' },
  ],
  sessions: [
    { id: 's1', recordatorio_pago_at: '2026-10-20T15:00:00Z' }, { id: 's2', recordatorio_pago_at: '2026-10-20T15:00:00Z' },
    { id: 's3', reminder_sent_at: '2026-10-20T15:00:00Z' }, { id: 's4', reminder_sent_at: '2026-10-21T15:00:00Z', recordatorio_pago_at: 'keep' },
  ],
}

await t('failed pago → recordatorio_pago_at cleared, ONE owner message (patient, number, error)', async () => {
  const w = world(base)
  const r = await reconcileReminderFailures(w.repo, { wamids: ['wamid.F'], now: NOW, notifyOwner: w.notifyOwner })
  assert.equal(r.failed, 1)
  assert.equal(w.db.sessions[0].recordatorio_pago_at, null); assert.equal(w.db.sessions[1].recordatorio_pago_at, null)
  assert.equal(w.owner.length, 1)
  assert.equal(w.owner[0].kind, 'recordatorio_fallido')
  assert.match(w.owner[0].messages[0].body, /Emily Rivera · \+593433182326/)
  assert.match(w.owner[0].messages[0].body, /131026 Message undeliverable/)
  assert.equal(w.db.sends[0].error, '131026 Message undeliverable')
})

await t('failed cita → only reminder_sent_at cleared; delivered send untouched', async () => {
  const w = world(base)
  await reconcileReminderFailures(w.repo, { now: NOW, notifyOwner: w.notifyOwner })
  const s4 = w.db.sessions.find((s) => s.id === 's4')
  assert.equal(s4.reminder_sent_at, null); assert.equal(s4.recordatorio_pago_at, 'keep')
  assert.equal(w.db.sessions.find((s) => s.id === 's3').reminder_sent_at, '2026-10-20T15:00:00Z')
  assert.equal(w.owner.length, 2) // rs1 + rs3, not rs2
  assert.match(w.owner.find((o) => /cita/.test(o.messages[0].body)).messages[0].body, /paciente sin identificar|Emily/)
})

await t('idempotent: webhook + cron both reconciling → owner told once per failure', async () => {
  const w = world(base)
  await reconcileReminderFailures(w.repo, { wamids: ['wamid.F'], now: NOW, notifyOwner: w.notifyOwner })
  await reconcileReminderFailures(w.repo, { wamids: ['wamid.F'], now: NOW, notifyOwner: w.notifyOwner })
  await reconcileReminderFailures(w.repo, { now: NOW, notifyOwner: w.notifyOwner })
  assert.equal(w.owner.filter((o) => /pago/.test(o.messages[0].body)).length, 1)
  assert.equal(w.owner.length, 2)
})

await t('notifyOwner throwing does not break reconciliation', async () => {
  const w = world(base)
  const r = await reconcileReminderFailures(w.repo, { now: NOW, notifyOwner: async () => { throw new Error('outbox down') } })
  assert.equal(r.failed, 2)
})

await t('failedBefore: same session + same number → skip; new number or new session → send', async () => {
  const w = world(base)
  await reconcileReminderFailures(w.repo, { now: NOW, notifyOwner: w.notifyOwner })
  assert.equal(await failedBefore(w.repo, { kind: 'pago', telefono: '+593433182326', sessionIds: ['s2', 's9'] }), true)
  assert.equal(await failedBefore(w.repo, { kind: 'pago', telefono: '+61433182326', sessionIds: ['s1', 's2'] }), false)
  assert.equal(await failedBefore(w.repo, { kind: 'pago', telefono: '+593433182326', sessionIds: ['s9'] }), false)
  assert.equal(await failedBefore(w.repo, { kind: 'cita', telefono: '+593433182326', sessionIds: ['s1'] }), false)
  assert.equal(await failedBefore(w.repo, { kind: 'cita', telefono: null, sessionIds: ['s4'] }), false)
})

await t('no failed status yet → nothing changes', async () => {
  const w = world({ ...base, statuses: [{ wamid: 'wamid.F', status: 'sent' }] })
  const r = await reconcileReminderFailures(w.repo, { now: NOW, notifyOwner: w.notifyOwner })
  assert.equal(r.failed, 0); assert.equal(w.owner.length, 0)
  assert.equal(w.db.sessions[0].recordatorio_pago_at, '2026-10-20T15:00:00Z')
})

console.log(results.join('\n'))
