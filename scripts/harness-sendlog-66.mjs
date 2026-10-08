// Harness for #66 (lead_bot_sends). In-memory Supabase (leadBotSim), transport
// stubbed — nothing is sent or written. Checks: every lead send is logged with
// its text + wamid + es_prueba; a failed send logs the error and re-throws as
// before; a slow / failing insert never delays or breaks a send.
// Run: node scripts/harness-sendlog-66.mjs
import assert from 'node:assert/strict'
import { memSupabase } from '../netlify/lib/leadBotSim.mjs'
import { recordLead, runBot, _setTransport } from '../netlify/lib/leadBot.mjs'
import { loggedSend, flushBotSendLogs } from '../netlify/lib/botSendLog.mjs'

delete process.env.ANTHROPIC_API_KEY
delete process.env.APIMART_API_KEY
process.env.LEAD_BOT_LIVE = 'false'
const OWNER = '593968029896'
const seed = () => memSupabase({
  therapists: [], funnel_categorias: [], funnel_knowledge: [], push_subscriptions: [],
  leads: [], lead_ai_decisions: [], whatsapp_messages: [], bot_test_mode: [], lead_bot_sends: [],
  patients: [], sessions: [],
})
let n = 0
const sent = []
_setTransport({
  sendText: async (to, body) => { sent.push(Date.now()); return { messages: [{ id: `wamid.T${++n}` }] } },
  sendImage: async () => { sent.push(Date.now()); return { messages: [{ id: `wamid.I${++n}` }] } },
  sendLinkText: async () => { sent.push(Date.now()); return { messages: [{ id: `wamid.L${++n}` }] } },
  notifyTherapist: async () => {},
})
async function turn(sb, text) {
  const msg = { id: `m${++n}`, from: OWNER, type: 'text', text: { body: text }, timestamp: String(Math.floor(Date.now() / 1000)) }
  const rec = await recordLead(sb, { msg, contact: { profile: { name: 'Nicolás' } }, esPrueba: true })
  if (rec.isNew) Object.assign(rec.lead, { saludo_enviado: false, bot_paused: false, nudges_sent: 0, parse_misses: 0 })
  await runBot(sb, { lead: rec.lead, isNew: rec.isNew, msg })
  return rec.lead
}

// 1. one test turn → rows with body, wamid, es_prueba, lead_id
const sb = seed()
const lead = await turn(sb, 'Cuál es el precio de las sesiones?')
const rows = sb.db.lead_bot_sends
console.log('▶ 1 turn →', rows.map((r) => `${r.kind} ${r.wamid} prueba=${r.es_prueba} "${String(r.body).slice(0, 40)}…"`))
assert.ok(rows.length >= 1)
for (const r of rows) {
  assert.equal(r.es_prueba, true); assert.equal(r.lead_id, lead.id); assert.match(r.wamid, /^wamid\./)
  assert.ok(r.body && r.body.length > 5); assert.equal(r.error, null); assert.equal(r.phone.slice(-4), '9896')
}

// 2. a thrown send → row with error + wamid null, the SAME error re-thrown
const boom = new Error('Dualhook 400: test')
await assert.rejects(loggedSend(sb, { lead, phone: lead.phone, kind: 'text', body: 'x' }, async () => { throw boom }), (e) => e === boom)
await flushBotSendLogs()
const errRow = sb.db.lead_bot_sends.at(-1)
assert.equal(errRow.wamid, null); assert.match(errRow.error, /Dualhook 400/)
console.log('▶ failed send logged:', errRow.error, '— re-thrown unchanged')

// 3. insert that throws synchronously / rejects / hangs → sends unaffected, flush capped
const bad = (mode) => ({ from: (t) => (t === 'lead_bot_sends'
  ? { insert: () => { if (mode === 'throw') throw new Error('boom'); return mode === 'reject' ? Promise.reject(new Error('permission denied')) : new Promise(() => {}) } }
  : sb.from(t)) })
for (const mode of ['throw', 'reject', 'hang']) {
  const t0 = Date.now()
  const res = await loggedSend(bad(mode), { lead, phone: lead.phone, kind: 'text', body: 'y' }, async () => ({ messages: [{ id: 'wamid.X' }] }))
  assert.equal(res.messages[0].id, 'wamid.X')
  assert.ok(Date.now() - t0 < 20, `send delayed by insert (${mode})`)
  const f0 = Date.now(); await flushBotSendLogs(300); assert.ok(Date.now() - f0 < 400)
  console.log(`▶ insert ${mode}: send returned in ${Date.now() - t0 - (Date.now() - f0)}ms, flush capped`)
}

// 4. slow DB (500 ms per insert) → the 3 sends of a turn are not spaced by it
const slow = seed()
const slowSb = { from: (t) => (t === 'lead_bot_sends' ? { insert: (r) => new Promise((ok) => setTimeout(() => ok(slow.from(t).insert(r)), 500)) } : slow.from(t)) }
sent.length = 0
await turn(slowSb, 'Hola, cuánto cuesta y dónde están?')
const gaps = sent.slice(1).map((t, i) => t - sent[i])
console.log('▶ slow DB: sends', sent.length, 'gaps(ms)', gaps, 'rows', slow.db.lead_bot_sends.length)
assert.ok(gaps.every((g) => g < 300), 'a slow insert delayed a send')
assert.equal(slow.db.lead_bot_sends.length, sent.length)

console.log('\nOK — all #66 checks passed')
