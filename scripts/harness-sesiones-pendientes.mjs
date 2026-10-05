// Harness for #52 (lib/sesionesPendientes.mjs). Everything external is stubbed:
// Supabase (repo), WhatsApp sends, template status, push, owner outbox, calendar.
// Run: node scripts/harness-sesiones-pendientes.mjs
import assert from 'node:assert/strict'
import { runSesionesPendientes, handleEstadoTap, buildBody, gyeDate } from '../netlify/lib/sesionesPendientes.mjs'
import { SESION_PENDIENTE_BODY } from '../netlify/lib/leadTemplates.mjs'

const NOW = new Date('2026-10-06T13:30:00Z') // 08:30 GYE
const SOPHIA = { id: 't-sophia', nombre: 'Sophia', apellido: 'Vergara', telefono: '0991111111', activo: true, calendar_email: 'sophia@gmail.com' }
const DANI = { id: 't-dani', nombre: 'Daniela', apellido: 'Espinosa', telefono: '+593992222222', activo: true, calendar_email: null }
const pareja = { nombre: 'Cecilia', apellido: 'Saltos', nombre_2: 'Valentina', apellido_2: 'Loor', tipo_paciente: 'pareja' }
const solo = { nombre: 'Ana', apellido: 'Pérez', tipo_paciente: 'individual' }
const U = (n) => `00000000-0000-4000-8000-00000000000${n}`

function world({ sessions, inbound = {}, reminders = [], credit = {} }) {
  const db = { sessions: structuredClone(sessions), reminders: structuredClone(reminders), credit: { ...credit } }
  const log = { free: [], template: [], push: [], owner: [], text: [], calendar: [], stuckQueryArgs: [] }
  const repo = {
    // Mirrors the real query: estado programada, tipo <> llamada, fecha < today.
    async stuckSessions(today) {
      log.stuckQueryArgs.push(today)
      return db.sessions.filter((s) => s.estado === 'programada' && s.tipo !== 'llamada' && s.fecha < today)
    },
    async getSession(id) { return db.sessions.find((s) => s.id === id) || null },
    async lastInbound(phone) { return inbound[phone.slice(-9)] || null },
    async remindersFor(ids) { return db.reminders.filter((r) => ids.includes(r.session_id)) },
    async insertReminder(row) { const r = { id: `r${db.reminders.length + 1}`, respuesta: null, escalated_at: null, ...row }; db.reminders.push(r); return { ...r } },
    async markEscalated(id, at) { db.reminders.find((r) => r.id === id).escalated_at = at },
    async stampRespuesta(sid, respuesta, at) { for (const r of db.reminders) if (r.session_id === sid && !r.respuesta) Object.assign(r, { respuesta, respondida_at: at }) },
    // Simulates the DB: guarded update + consume_saldo_on_confirm on confirmada.
    async closeSession(id, estado) {
      const s = db.sessions.find((x) => x.id === id)
      if (!s || s.estado !== 'programada') return false
      s.estado = estado
      if (estado === 'cancelada') { s.pagado = false; s.paid_at = null }
      if (estado === 'confirmada' && !s.pagado && (db.credit[s.patient_id] || 0) >= s.monto) { db.credit[s.patient_id] -= s.monto; s.pagado = true }
      return true
    },
  }
  const mk = (approved, { failSend = false } = {}) => ({
    now: () => NOW,
    templateApproved: async () => approved,
    sendStaffButtons: async (to, body, buttons) => { if (failSend) throw new Error('boom'); log.free.push({ to, body, buttons }); return 'wamid.free' },
    sendSesionPendiente: async (to, p) => { if (failSend) throw new Error('boom'); log.template.push({ to, ...p }); return 'wamid.tpl' },
    notifyTherapist: async (_sb, tid, n, opts) => { log.push.push({ tid, ...n, opts }) },
    notifyOwner: async (_sb, o) => { log.owner.push(o) },
    sendText: async (to, body) => { log.text.push({ to, body }) },
    cancelCalendar: async (cal, ev) => { log.calendar.push({ cal, ev }) },
  })
  return { db, log, repo, mk }
}

const base = [
  { id: U(1), fecha: '2026-10-02', hora_inicio: '11:00:00', tipo: 'individual', estado: 'programada', terapeuta_id: SOPHIA.id, therapist: SOPHIA, patient: pareja, patient_id: 'p1', monto: 35, pagado: false, google_event_id: 'ev1' },
  { id: U(2), fecha: '2026-10-01', hora_inicio: '10:00:00', tipo: 'llamada', estado: 'programada', terapeuta_id: SOPHIA.id, therapist: SOPHIA, patient: solo, patient_id: 'p2' },
  { id: U(3), fecha: '2026-10-06', hora_inicio: '15:00:00', tipo: 'individual', estado: 'programada', terapeuta_id: SOPHIA.id, therapist: SOPHIA, patient: solo, patient_id: 'p2' },
  { id: U(4), fecha: '2026-10-09', hora_inicio: '15:00:00', tipo: 'individual', estado: 'programada', terapeuta_id: SOPHIA.id, therapist: SOPHIA, patient: solo, patient_id: 'p2' },
  { id: U(5), fecha: '2026-10-03', hora_inicio: '09:00:00', tipo: 'individual', estado: 'programada', terapeuta_id: DANI.id, therapist: DANI, patient: solo, patient_id: 'p2', monto: 40, pagado: false },
]
const results = []
const t = async (name, fn) => { try { await fn(); results.push(`PASS ${name}`) } catch (e) { results.push(`FAIL ${name}: ${e.message}`); process.exitCode = 1 } }

await t('window open → free-form interactive (emoji kept, ids est_ok/est_no)', async () => {
  const w = world({ sessions: base, inbound: { '991111111': '2026-10-06T02:00:00Z' } })
  await runSesionesPendientes(null, { repo: w.repo, deps: w.mk(true) })
  const m = w.log.free.find((x) => x.to === '+593991111111')
  assert.ok(m)
  assert.equal(m.body, 'Hola Sophia! Hay una sesión que se quedó en estado pendiente.\n\nCecilia Saltos + Valentina Loor, del 2 de octubre\n\nSe dio la sesión?\n\nAtt: La Caracola Mágica🐚✨')
  assert.deepEqual(m.buttons, [{ id: `est_ok:${U(1)}`, title: 'Ocurrió' }, { id: `est_no:${U(1)}`, title: 'No ocurrió' }])
  assert.equal(w.db.reminders.find((r) => r.session_id === U(1)).canal, 'free')
})
await t('window closed + approved → template; Daniela → "Dani"', async () => {
  const w = world({ sessions: base })
  await runSesionesPendientes(null, { repo: w.repo, deps: w.mk(true) })
  assert.equal(w.log.free.length, 0)
  assert.deepEqual(w.log.template.map((x) => [x.nombre, x.paciente, x.fecha, x.sessionId]), [
    ['Sophia', 'Cecilia Saltos + Valentina Loor', '2 de octubre', U(1)], ['Dani', 'Ana Pérez', '3 de octubre', U(5)]])
})
await t('not approved → ONE push per therapist, therapist only (skipOwner)', async () => {
  const w = world({ sessions: [...base, { ...base[0], id: U(6), fecha: '2026-09-30' }] })
  await runSesionesPendientes(null, { repo: w.repo, deps: w.mk(false) })
  assert.equal(w.log.template.length, 0)
  assert.equal(w.log.push.length, 2)
  const p = w.log.push.find((x) => x.tid === SOPHIA.id)
  assert.equal(p.body, 'Tienes 2 sesiones en Pendiente. Ábrelas en Sesiones para marcarlas.')
  assert.equal(p.opts.skipOwner, true)
  assert.equal(w.db.reminders.filter((r) => r.canal === 'push').length, 3)
})
await t('send failure → push fallback', async () => {
  const w = world({ sessions: base })
  await runSesionesPendientes(null, { repo: w.repo, deps: w.mk(true, { failSend: true }) })
  assert.equal(w.log.push.length, 2)
})
await t('llamadas + today/future never included (even if the query leaks them)', async () => {
  const w = world({ sessions: base })
  w.repo.stuckSessions = async () => w.db.sessions // simulate a leaky query
  const r = await runSesionesPendientes(null, { repo: w.repo, deps: w.mk(true) })
  const sent = w.log.template.map((x) => x.sessionId)
  assert.deepEqual(sent, [U(1), U(5)])
  assert.ok(!w.db.reminders.some((x) => [U(2), U(3), U(4)].includes(x.session_id)))
  assert.equal(r.today, '2026-10-06')
})
await t('same-day rerun does not double-send', async () => {
  const w = world({ sessions: base })
  await runSesionesPendientes(null, { repo: w.repo, deps: w.mk(true) })
  await runSesionesPendientes(null, { repo: w.repo, deps: w.mk(true) })
  assert.equal(w.log.template.length, 2)
})
await t('3rd day unanswered → exactly one notifyOwner; 4th day keeps reminding, no 2nd escalation', async () => {
  const prior = [{ id: 'a', session_id: U(1), sent_at: '2026-10-04T13:30:00Z', canal: 'template' }, { id: 'b', session_id: U(1), sent_at: '2026-10-05T13:30:00Z', canal: 'template' }]
  const w = world({ sessions: base, reminders: prior })
  await runSesionesPendientes(null, { repo: w.repo, deps: w.mk(true) })
  assert.equal(w.log.owner.length, 1)
  assert.equal(w.log.owner[0].resumen, 'Sesión sin cerrar: Sophia · Cecilia Saltos + Valentina Loor · 2 de octubre (3 recordatorios)')
  assert.equal(w.log.owner[0].kind, 'sesion_sin_cerrar')
  const day4 = w.mk(true); day4.now = () => new Date('2026-10-07T13:30:00Z')
  await runSesionesPendientes(null, { repo: w.repo, deps: day4 })
  assert.equal(w.log.owner.length, 1)
  assert.equal(w.log.template.filter((x) => x.sessionId === U(1)).length, 2)
})
await t('2 days unanswered → no escalation', async () => {
  const w = world({ sessions: base, reminders: [{ id: 'a', session_id: U(1), sent_at: '2026-10-05T13:30:00Z', canal: 'template' }] })
  await runSesionesPendientes(null, { repo: w.repo, deps: w.mk(true) })
  assert.equal(w.log.owner.length, 0)
})

const tapBtn = (from, payload) => ({ from, type: 'button', button: { payload, text: 'x' } })
const tapInt = (from, id) => ({ from, type: 'interactive', interactive: { type: 'button_reply', button_reply: { id, title: 'x' } } })

await t('tap from the wrong phone → ignored (no estado change, no reply)', async () => {
  const w = world({ sessions: base })
  assert.equal(await handleEstadoTap(null, tapInt('593993333333', `est_ok:${U(1)}`), { repo: w.repo, deps: w.mk(true) }), true)
  assert.equal(w.db.sessions[0].estado, 'programada')
  assert.equal(w.log.text.length, 0)
})
await t('tap on an already closed session → "ya estaba cerrada"', async () => {
  const w = world({ sessions: base.map((s) => s.id === U(1) ? { ...s, estado: 'confirmada' } : s) })
  await handleEstadoTap(null, tapBtn('593991111111', `est_no:${U(1)}`), { repo: w.repo, deps: w.mk(true) })
  assert.deepEqual(w.log.text, [{ to: '593991111111', body: 'Esa sesión ya estaba cerrada.' }])
  assert.equal(w.log.calendar.length, 0)
})
await t('est_ok (template quick-reply) on a patient with credit → confirmada + pagado from credit, no push', async () => {
  const w = world({ sessions: base, credit: { p1: 140 }, reminders: [{ id: 'a', session_id: U(1), sent_at: '2026-10-06T13:30:00Z', canal: 'template', respuesta: null }] })
  await handleEstadoTap(null, tapBtn('593991111111', `est_ok:${U(1)}`), { repo: w.repo, deps: w.mk(true) })
  const s = w.db.sessions[0]
  assert.equal(s.estado, 'confirmada'); assert.equal(s.pagado, true); assert.equal(w.db.credit.p1, 105)
  assert.equal(w.db.reminders[0].respuesta, 'ocurrio'); assert.ok(w.db.reminders[0].respondida_at)
  assert.deepEqual(w.log.text.map((x) => x.body), ['Listo, quedó como Confirmada.'])
  assert.equal(w.log.push.length, 0)
})
await t('est_no (interactive) → cancelada + calendar cancel called', async () => {
  const w = world({ sessions: base })
  await handleEstadoTap(null, tapInt('+593991111111', `est_no:${U(1)}`), { repo: w.repo, deps: w.mk(true) })
  assert.equal(w.db.sessions[0].estado, 'cancelada')
  assert.deepEqual(w.log.calendar, [{ cal: 'sophia@gmail.com', ev: 'ev1' }])
  assert.deepEqual(w.log.text.map((x) => x.body), ['Listo, quedó como Cancelada.'])
  assert.equal(w.log.push.length, 0)
})
await t('non-est messages are not consumed', async () => {
  const w = world({ sessions: base })
  assert.equal(await handleEstadoTap(null, { from: '1', type: 'text', text: { body: `est_ok:${U(1)}` } }, { repo: w.repo, deps: w.mk(true) }), false)
  assert.equal(await handleEstadoTap(null, tapBtn('1', 'Confirmo'), { repo: w.repo, deps: w.mk(true) }), false)
})
await t('copy check: no ¡ ¿, emoji signature present, does not end in a variable', async () => {
  assert.ok(!/[¡¿]/.test(SESION_PENDIENTE_BODY))
  assert.ok(SESION_PENDIENTE_BODY.endsWith('Att: La Caracola Mágica🐚✨'))
  assert.ok(!/\{\{\d\}\}\s*$/.test(SESION_PENDIENTE_BODY))
  assert.ok(!/[¡¿]/.test(buildBody({ nombre: 'Dani', paciente: 'X', fecha: '1 de enero' })))
  assert.equal(gyeDate('2026-10-06T04:59:00Z'), '2026-10-05')
})
console.log(results.join('\n'))
