// Harness for #58 ("Message unavailable" → silent handoff to Nicolás). In-memory
// Supabase (leadBotSim), WhatsApp/push stubbed — nothing is sent or written.
// Uses the REAL inbound of lead e4f6ecd6 (2026-10-07, type unsupported, code 131060).
// No ANTHROPIC_API_KEY locally → free text uses the keyword fallback.
// Run: node scripts/harness-mensaje-no-disponible.mjs
import assert from 'node:assert/strict'
import { memSupabase } from '../netlify/lib/leadBotSim.mjs'
import { recordLead, runBot, _setTransport } from '../netlify/lib/leadBot.mjs'

delete process.env.ANTHROPIC_API_KEY
delete process.env.APIMART_API_KEY
process.env.LEAD_BOT_LIVE = 'true'
process.env.LEAD_BOT_TEST_PHONES = ''

// Real payload (whatsapp_messages 96670b1f…), phone swapped per scenario.
const REAL = {
  contact: { wa_id: '593997970697', profile: { name: 'yp903951' }, user_id: 'EC.1770099531020025' },
  message: {
    id: 'wamid.HBgMNTkzOTk3OTcwNjk3FQIAEhggQUNGRDY4OTJFNjU2Njg0REQxNDE0RkMzRjY2MUM5RDEA',
    from: '593997970697', type: 'unsupported',
    errors: [{ code: 131060, title: 'This message is unavailable.', message: 'This message is unavailable.', error_data: { details: 'This message is currently unavailable.' } }],
    timestamp: '1791341365', unsupported: { type: 'unknown', raw_type: 'unknown' }, from_user_id: 'EC.1770099531020025',
  },
}

const sb = memSupabase({
  therapists: [], funnel_categorias: [], funnel_knowledge: [], push_subscriptions: [],
  leads: [], lead_ai_decisions: [], whatsapp_messages: [], bot_test_mode: [], patients: [], sessions: [],
})
const out = []
_setTransport({
  sendText: async (to, body) => out.push(`SEND→${to.slice(-4)} ${body}`),
  sendImage: async () => out.push('SEND image'), sendLinkText: async (to, b) => out.push(`SEND link ${b}`),
  notifyTherapist: async (_s, t, { title, body }) => out.push(`PUSH(${t ?? 'owner'}) ${title} | ${body}`),
})

const DEFAULTS = { saludo_enviado: false, invitacion_enviada: false, bot_paused: false, nudges_sent: 0, parse_misses: 0 }
async function inbound(msg, contact, { esPrueba = false, patch = null } = {}) {
  const rec = await recordLead(sb, { msg, contact, esPrueba })
  // The webhook stores the inbound row AFTER the lead handling (else it reads as a known contact).
  sb.db.whatsapp_messages.push({ id: msg.id, direccion: 'inbound', received_at: new Date().toISOString(), raw_payload: { message: msg, contact } })
  assert.ok(rec, 'lead recorded')
  if (rec.isNew) { // real table defaults (the in-memory insert has none)
    Object.assign(sb.db.leads.find((l) => l.id === rec.lead.id), DEFAULTS); Object.assign(rec.lead, DEFAULTS)
  }
  if (patch) { Object.assign(sb.db.leads.find((l) => l.id === rec.lead.id), patch); Object.assign(rec.lead, patch) }
  out.length = 0
  await runBot(sb, { lead: rec.lead, isNew: rec.isNew, msg })
  return { lines: [...out], lead: sb.db.leads.find((l) => l.id === rec.lead.id) }
}
const show = (label, lines) => console.log(`\n▶ ${label}\n  ${lines.join('\n  ') || '(nada)'}`)
const decisionsFor = (lead) => sb.db.lead_ai_decisions.filter((d) => d.lead_id === lead.id)
const withPhone = (p) => ({ contact: { ...REAL.contact, wa_id: p }, message: { ...REAL.message, from: p, id: `${REAL.message.id}-${p}` } })

function assertSilentHandoff(lines, lead, name, { prueba = false } = {}) {
  assert.equal(lines.filter((l) => l.startsWith('SEND')).length, 0, 'zero texts to the lead')
  assert.deepEqual(lines, [`PUSH(owner) Mensaje no disponible | ${name} te escribió y no se pudo leer el mensaje. Respóndele tú.`])
  assert.equal(lead.bot_paused, true, 'bot paused')
  const d = decisionsFor(lead)
  assert.equal(d.length, 1)
  assert.equal(d[0].motivo, 'mensaje_no_disponible'); assert.equal(d[0].model, 'regla'); assert.equal(d[0].accion, 'derivar')
  assert.equal(d[0].texto_in, '[unsupported 131060]'); assert.equal(d[0].es_prueba, prueba)
}

// 1. The real case: e4f6ecd6 mid-flow (step "quien") asked the price → unavailable.
let p = withPhone('593997970697')
let r = await inbound(p.message, p.contact, { patch: { step_actual: 'quien', saludo_enviado: true } })
show('real payload e4f6ecd6, step quien', r.lines)
assertSilentHandoff(r.lines, r.lead, 'yp903951')

// 2. First contact that arrives unavailable → no greeting either.
p = withPhone('593990000001')
r = await inbound(p.message, p.contact)
show('primer contacto no disponible', r.lines)
assertSilentHandoff(r.lines, r.lead, 'yp903951')
assert.equal(r.lead.saludo_enviado, false, 'no greeting sent')

// 3. No wa_name → phone in the push body.
p = withPhone('593990000002'); p.contact = { ...p.contact, profile: {} }
r = await inbound(p.message, p.contact)
show('sin wa_name', r.lines)
assertSilentHandoff(r.lines, r.lead, r.lead.phone)

// 4. es_prueba lead behaves the same (decision flagged es_prueba).
p = withPhone('593990000003')
r = await inbound(p.message, p.contact, { esPrueba: true })
show('es_prueba', r.lines)
assertSilentHandoff(r.lines, r.lead, 'yp903951', { prueba: true })

// 5. Normal text keeps working: the bot replies, not paused, no 'mensaje_no_disponible'.
p = withPhone('593990000004')
const text = { ...p.message, type: 'text', text: { body: 'Cuál es el precio de las sesiones?' } }
delete text.errors; delete text.unsupported
r = await inbound(text, p.contact)
show('texto normal', r.lines)
assert.ok(r.lines.some((l) => l.startsWith('SEND')), 'bot replied')
assert.equal(r.lead.bot_paused, false)
assert.ok(!decisionsFor(r.lead).some((d) => d.motivo === 'mensaje_no_disponible'))

// 6. Sticker keeps the current behavior (askPending), not this handoff.
p = withPhone('593990000005')
r = await inbound({ id: 'stk', from: '593990000005', type: 'sticker', sticker: {} }, p.contact, { patch: { step_actual: 'quien', saludo_enviado: true } })
show('sticker (sin cambio)', r.lines)
assert.ok(!r.lines.some((l) => l.includes('Mensaje no disponible')))
assert.ok(!decisionsFor(r.lead).some((d) => d.motivo === 'mensaje_no_disponible'))

console.log('\n✅ #58 harness OK')
