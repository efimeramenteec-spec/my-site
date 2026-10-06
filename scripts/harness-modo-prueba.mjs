// Harness for #56 (bot test mode from the owner phone). In-memory Supabase
// (leadBotSim), WhatsApp/push/calendar/Meta stubbed — nothing is sent or written.
// The owner-phone routing below mirrors whatsapp-cloud-webhook.mjs in the same
// order: facturas → routeOwnerMessage → lead flow (recordLead + runBot) | owner path.
// No ANTHROPIC_API_KEY locally → the bot uses its keyword fallback.
// Run: node scripts/harness-modo-prueba.mjs
import assert from 'node:assert/strict'
import { memSupabase } from '../netlify/lib/leadBotSim.mjs'
import { recordLead, runBot, _setTransport, botAllowedForPhone } from '../netlify/lib/leadBot.mjs'
import { routeOwnerMessage, TEST_REPLIES, testCommand } from '../netlify/lib/botTestMode.mjs'
import { isOwnerPhone, isFacturasCommand } from '../netlify/lib/facturarAprobacion.mjs'
import { sweepCapiEvents } from '../netlify/lib/capi.mjs'

delete process.env.ANTHROPIC_API_KEY
delete process.env.APIMART_API_KEY
process.env.LEAD_BOT_LIVE = 'false' // the test lead must work even with the bot dark
process.env.LEAD_BOT_TEST_PHONES = ''

const OWNER = '593968029896'
let clock = new Date('2026-10-06T15:00:00Z')
const sb = memSupabase({
  therapists: [], funnel_categorias: [], funnel_knowledge: [], push_subscriptions: [],
  leads: [], lead_ai_decisions: [], whatsapp_messages: [], bot_test_mode: [],
  patients: [{ id: 'p-owner', telefono: '+593968029896', nombre: 'Nicolás', es_lead: true }],
  sessions: [],
})
// Prior owner inbound on record (he has written to the 9933 many times) — the
// known-contact rule would normally skip him; es_prueba must bypass it.
sb.db.whatsapp_messages.push({ id: 'old', direccion: 'inbound', received_at: '2026-10-01T00:00:00Z', raw_payload: { message: { from: OWNER, type: 'text' } } })

const out = []
_setTransport({
  sendText: async (to, body) => out.push(`BOT→${to.slice(-4)} ${body}`),
  sendImage: async () => out.push('BOT image'), sendLinkText: async (to, b) => out.push(`BOT link ${b}`),
  notifyTherapist: async (_s, t, { title }) => out.push(`PUSH(${t ?? 'owner'}) ${title}`),
})
const deps = {
  sendStaffText: async (to, body) => out.push(`OWNER-REPLY ${body}`),
  cancelCalendar: async (cal, ev) => out.push(`CAL-CANCEL ${cal} ${ev}`),
  now: () => clock,
}

let k = 0
async function owner(text) {
  const msg = { id: `m${++k}`, from: OWNER, type: 'text', text: { body: text }, timestamp: String(Math.floor(clock / 1000)) }
  sb.db.whatsapp_messages.push({ id: msg.id, direccion: 'inbound', received_at: clock.toISOString(), raw_payload: { message: msg } })
  out.length = 0
  assert.ok(isOwnerPhone(msg.from))
  if (isFacturasCommand(msg)) { out.push('OWNER facturas command (as today)'); return [...out] }
  const route = await routeOwnerMessage(sb, msg, deps)
  if (route === 'command') return [...out]
  if (route === 'owner') { out.push('OWNER PATH (no bot)'); return [...out] }
  const rec = await recordLead(sb, { msg, contact: { profile: { name: 'Nicolás' } }, esPrueba: true })
  assert.ok(rec, 'test lead recorded')
  if (rec.isNew) { // the real table's column defaults (the in-memory insert has none)
    const defaults = { saludo_enviado: false, invitacion_enviada: false, bot_paused: false, nudges_sent: 0, parse_misses: 0 }
    Object.assign(sb.db.leads.find((l) => l.id === rec.lead.id), defaults); Object.assign(rec.lead, defaults)
  }
  assert.ok(botAllowedForPhone(rec.lead.phone, rec.lead), 'test lead allowed with bot dark')
  await runBot(sb, { lead: rec.lead, isNew: rec.isNew, msg })
  return [...out]
}
const show = (label, lines) => console.log(`\n▶ ${label}\n  ${lines.join('\n  ')}`)
const ownerLead = () => sb.db.leads.find((l) => l.phone === '+593968029896')

// 0. commands are exact, case- and accent-insensitive
assert.equal(testCommand({ type: 'text', text: { body: '  MODO   Prueba ' } }), 'on')
assert.equal(testCommand({ type: 'text', text: { body: 'Reiniciar' } }), 'reset')
assert.equal(testCommand({ type: 'text', text: { body: 'fin prueba' } }), 'off')
assert.equal(testCommand({ type: 'text', text: { body: 'modo prueba ya' } }), null)

// 1. no test mode → owner path, never the bot
let r = await owner('hola'); show('sin modo prueba: "hola"', r)
assert.deepEqual(r, ['OWNER PATH (no bot)']); assert.equal(ownerLead(), undefined)

// 2. activation
r = await owner('modo prueba'); show('"modo prueba"', r)
assert.deepEqual(r, [`OWNER-REPLY ${TEST_REPLIES.on}`])
assert.equal(sb.db.bot_test_mode[0].activo, true)

// 3. price question → first contact, greeted as Nico
r = await owner('Cuál es el precio de las sesiones? $'); show('"Cuál es el precio de las sesiones? $"', r)
assert.match(r[0], /^BOT→9896 Hola, hablas con Nico\. La sesión/)
assert.equal(ownerLead().es_prueba, true)

// 4. facturas still the owner command
r = await owner('facturas'); show('"facturas" con modo prueba', r)
assert.deepEqual(r, ['OWNER facturas command (as today)'])

// 5. a [PRUEBA] llamada from the link exists → reiniciar cancels it, deletes the lead
sb.db.sessions.push({ id: 's-test', patient_id: 'p-owner', tipo: 'llamada', estado: 'programada', notas: '[PRUEBA] Agendada en modo prueba del bot', google_event_id: null, terapeuta_id: 't1' })
sb.db.sessions.push({ id: 's-real', patient_id: 'p-owner', tipo: 'llamada', estado: 'programada', notas: null })
const decBefore = sb.db.lead_ai_decisions.length
r = await owner('Reiniciar'); show('"reiniciar"', r)
assert.deepEqual(r, [`OWNER-REPLY ${TEST_REPLIES.reset}`])
assert.equal(ownerLead(), undefined, 'test lead deleted')
assert.equal(sb.db.sessions.find((s) => s.id === 's-test').estado, 'cancelada')
assert.equal(sb.db.sessions.find((s) => s.id === 's-real').estado, 'programada', 'non-[PRUEBA] llamada untouched')
assert.equal(sb.db.lead_ai_decisions.length, decBefore, 'decisions kept')
assert.ok(sb.db.lead_ai_decisions.every((d) => d.es_prueba === true), 'decisions flagged es_prueba')
assert.equal(sb.db.bot_test_mode[0].activo, true, 'mode stays active')

// 6. next message = first contact again (greeting again)
r = await owner('Cuál es el precio de las sesiones? $'); show('después de reiniciar', r)
assert.match(r[0], /^BOT→9896 Hola, hablas con Nico\./)
assert.equal(sb.db.leads.filter((l) => l.phone === '+593968029896').length, 1, 'one fresh test lead')

// 7. expiry: 2h after the last message → owner path, no bot, no warning
clock = new Date(clock.getTime() + 2 * 3600e3 + 1000)
const sentBefore = sb.db.leads.length
r = await owner('hola de nuevo'); show('expira_at en el pasado', r)
assert.deepEqual(r, ['OWNER PATH (no bot)'])
assert.equal(sb.db.leads.length, sentBefore)

// 8. each message renews: activate, wait 1h50, write, wait 1h50 → still active
await owner('modo prueba')
clock = new Date(clock.getTime() + 110 * 60e3); await owner('hola')
clock = new Date(clock.getTime() + 110 * 60e3); r = await owner('sigo aquí')
assert.notDeepEqual(r, ['OWNER PATH (no bot)'], 'renewed by each message')

// 9. fin prueba
r = await owner('fin prueba'); show('"fin prueba"', r)
assert.deepEqual(r, [`OWNER-REPLY ${TEST_REPLIES.off}`])
r = await owner('hola'); assert.deepEqual(r, ['OWNER PATH (no bot)'])

// 10. CAPI: an es_prueba lead with a ctwa_clid + booked call → 0 events; a real one fires.
process.env.CAPI_LIVE = 'true'; delete process.env.CAPI_TEST_CODE; process.env.META_DATASET_ID = 'ds1'; process.env.WA_DUALHOOK_API_KEY = 'x'
process.env.CAPI_ALLOW_TEST_PHONE = 'true'
Object.assign(ownerLead(), { ctwa_clid: 'clid-owner', agendo_at: clock.toISOString(), eligio_terapeuta_at: clock.toISOString() })
sb.db.leads.push({ id: 'real', phone: '+593968029896'.replace('968029896', '991234567'), es_prueba: false, ctwa_clid: 'clid-real', agendo_at: new Date().toISOString(), eligio_terapeuta_at: new Date().toISOString() })
const calls = []
globalThis.fetch = async (url, init) => { calls.push(JSON.parse(init.body).data[0]); return new Response('{"events_received":1}', { status: 200 }) }
const sum = await sweepCapiEvents(sb)
console.log(`\n▶ CAPI sweep ${JSON.stringify(sum)} — events: ${calls.map((c) => `${c.event_name}(${c.user_data.ctwa_clid})`).join(', ')}`)
assert.ok(calls.length > 0 && calls.every((c) => c.user_data.ctwa_clid === 'clid-real'), '0 events for es_prueba')
assert.equal(ownerLead().capi_schedule_sent_at, undefined)

console.log('\nOK — all #56 checks passed')
