// Harness for #96 (Efimeramente HQ WhatsApp desk). Nothing is sent, nothing is written to the
// real DB: in-memory Supabase (leadBotSim), WhatsApp + Claude stubbed.
//
// Part 1 (routing): owner messages go through the owner block of whatsapp-cloud-webhook.mjs in
// its real order (outbox flush, Ver tap, facturas/fac_* taps, HQ desk, test-mode router, then
// the rest). Only "Michael: ..." / "Wes: ..." may reach hq-desk; "hola" and an Instagram link
// must take exactly the route they take today (routeOwnerMessage, owner path, logged only).
// The webhook source is also checked so the HQ branch sits AFTER the facturas handler and
// BEFORE the test-mode router.
// Part 2 (desk): handleHqOrder with a stubbed Claude: order stored, reply via owner outbox
// to Nicolás only, tokens + cost logged, en_cola for work, window closed = stored, not sent.
// Run: node scripts/harness-hq-96.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { memSupabase } from '../netlify/lib/leadBotSim.mjs'
import { routeOwnerMessage } from '../netlify/lib/botTestMode.mjs'
import { isOwnerPhone, isFacturasCommand, facturaTap } from '../netlify/lib/facturarAprobacion.mjs'
import { hqOrderFor, handleHqOrder, MAX_REPLY } from '../netlify/lib/hqDesk.mjs'

const OWNER = '593968029896'
const clock = new Date('2026-10-29T15:00:00Z')

// ── Part 0: the webhook's owner block order (source check) ─────────────────────────
const src = readFileSync(new URL('../netlify/functions/whatsapp-cloud-webhook.mjs', import.meta.url), 'utf8')
const iFact = src.indexOf('if (await handleOwnerFacturar(supabase, msg)) continue')
const iHq = src.indexOf('const hqOrder = hqOrderFor(msg)')
const iRoute = src.indexOf('const route = await routeOwnerMessage(supabase, msg)')
assert.ok(iFact > 0 && iHq > iFact && iRoute > iHq, 'HQ branch must sit between facturas and the test-mode router')
console.log('✓ webhook order: outbox flush → facturas/fac_* → HQ desk → test-mode router → rest (unchanged)')

// ── Part 1: routing ───────────────────────────────────────────────────────────────
const sb = memSupabase({ bot_test_mode: [], leads: [], whatsapp_messages: [], patients: [], sessions: [] })
const hqCalls = []
let k = 0
async function ownerInbound(body, { testMode = false } = {}) {
  const msg = { id: `wamid.T${++k}`, from: OWNER, type: 'text', text: { body }, timestamp: String(Math.floor(clock / 1000)) }
  sb.db.bot_test_mode = testMode ? [{ telefono: '+' + OWNER, activo: true, expira_at: new Date(clock.getTime() + 3600e3).toISOString() }] : []
  assert.ok(isOwnerPhone(msg.from))
  // mirror of the webhook owner block, in order
  if (isFacturasCommand(msg) || facturaTap(msg)) return 'facturas (as today)'
  const hq = hqOrderFor(msg)
  if (hq) { hqCalls.push({ ...hq, wamid: msg.id }); return `HQ DESK → ${hq.agent}` }
  const route = await routeOwnerMessage(sb, msg, { sendStaffText: async () => {}, now: () => clock })
  return route === 'owner' ? 'owner path (logged in whatsapp_messages only, as today)' : `test-mode route '${route}' (as today)`
}

const cases = [
  ['Michael: ¿qué está pendiente?', /^HQ DESK → michael$/],
  ['Wes: estado del post 2', /^HQ DESK → wes$/],
  ['hola', /^owner path/],
  ['https://www.instagram.com/p/DQabc123/?igsh=xyz', /^owner path/],
  ['facturas', /^facturas/],
]
for (const [body, want] of cases) {
  const r = await ownerInbound(body)
  console.log(`  ${JSON.stringify(body).padEnd(52)} ${r}`)
  assert.match(r, want)
}
// The baseline: without the HQ branch, "hola" and the IG link take the SAME route.
for (const body of ['hola', 'https://www.instagram.com/p/DQabc123/?igsh=xyz']) {
  const before = await routeOwnerMessage(sb, { id: 'x', from: OWNER, type: 'text', text: { body } }, { sendStaffText: async () => {}, now: () => clock })
  assert.equal(before, 'owner')
  assert.equal(hqOrderFor({ from: OWNER, type: 'text', text: { body } }), null)
}
// Non-owner "Michael: ..." never reaches the desk; image from the owner never does either.
assert.equal(hqOrderFor({ from: '593999111222', type: 'text', text: { body: 'Michael: hola' } }), null)
assert.equal(hqOrderFor({ from: OWNER, type: 'image', image: { id: 'x' } }), null)
assert.equal(hqOrderFor({ from: OWNER, type: 'text', text: { body: 'Michaela: hola' } }), null)
assert.deepEqual(hqOrderFor({ from: OWNER, type: 'text', text: { body: 'WÉS, sube el 3' } }), { agent: 'wes', texto: 'sube el 3' })
assert.equal(hqCalls.length, 2)
console.log('✓ only the two employee orders reached hq-desk; "hola" + IG link routed exactly as today')

// ── Part 2: the desk ──────────────────────────────────────────────────────────────
const desk = memSupabase({ hq_orders: [], owner_outbox: [], whatsapp_messages: [], saldo_lotes: [], sessions: [], leads: [], payroll_runs: [] })
const sent = []
let lastSystem = ''
const mkDeps = ({ necesita = false, respuesta, windowOpen = true } = {}) => ({
  callClaude: async ({ system }) => {
    lastSystem = system
    return { input: { respuesta: respuesta || 'Top 3: ACCESS, brief, carrusel.', necesita_trabajo: necesita }, usage: { input_tokens: 2100, output_tokens: 180 }, model: 'stub' }
  },
  deliverRow: async (_s, to, row) => { sent.push({ to, body: row.payload.messages[0].body }); return { sent: true, wamids: [`wamid.OUT${sent.length}`] } },
  lastOwnerInbound: async () => (windowOpen ? new Date(clock - 3600e3).toISOString() : '2026-10-01T00:00:00Z'),
  owner: () => '+' + OWNER,
  now: () => clock,
})
// the in-memory insert has no column defaults: fill id/created_at like Postgres would
const origFrom = desk.from
desk.from = (t) => {
  const q = origFrom(t)
  const ins = q.insert?.bind(q)
  if (ins) q.insert = (row) => ins({ id: `${t}-${desk.db[t].length + 1}`, created_at: clock.toISOString(), ...row })
  return q
}

const a = await handleHqOrder(desk, { agent: 'michael', texto: '¿qué está pendiente?', wamid: 'wamid.T1', from: OWNER, msgTs: null }, mkDeps())
assert.equal(a.sent, true); assert.equal(a.estado, 'respondido')
const rowA = desk.db.hq_orders[0]
assert.equal(rowA.input_tokens, 2100); assert.equal(rowA.output_tokens, 180); assert.equal(rowA.cost_usd, 0.0090)
assert.equal(rowA.reply_wamid, 'wamid.OUT1'); assert.ok(sent[0].body.startsWith('Michael: '))
assert.equal(sent[0].to, '+' + OWNER)
assert.match(lastSystem, /Michael · CEO/); assert.match(lastSystem, /WHATSAPP DESK MODE/)
console.log(`✓ Michael answered (${rowA.input_tokens}+${rowA.output_tokens} tokens, $${rowA.cost_usd}) → ${sent[0].to}: "${sent[0].body}"`)

const b = await handleHqOrder(desk, { agent: 'wes', texto: 'publica el post 2', wamid: 'wamid.T2', from: OWNER }, mkDeps({ necesita: true, respuesta: 'El post 2 aún no está renderizado.', }))
assert.equal(b.estado, 'en_cola'); assert.match(desk.db.hq_orders[1].respuesta, /Terminal/)
console.log(`✓ work order stored as en_cola: "${desk.db.hq_orders[1].respuesta}"`)

const long = 'x'.repeat(900)
await handleHqOrder(desk, { agent: 'alex', texto: 'resumen', wamid: 'wamid.T3', from: OWNER }, mkDeps({ respuesta: long }))
assert.ok(desk.db.hq_orders[2].respuesta.length <= MAX_REPLY)
console.log(`✓ reply capped at ${MAX_REPLY} chars`)

const nSent = sent.length
const c = await handleHqOrder(desk, { agent: 'tim', texto: 'estado', wamid: 'wamid.T4', from: OWNER }, mkDeps({ windowOpen: false }))
assert.equal(c.sent, false); assert.equal(c.reason, 'window_closed'); assert.equal(sent.length, nSent)
assert.equal(desk.db.owner_outbox.at(-1).estado, 'pendiente'); assert.equal(desk.db.owner_outbox.at(-1).ping_sent_at, undefined)
console.log('✓ window closed: reply stored (outbox pendiente), nothing sent, no ping template')

await assert.rejects(handleHqOrder(desk, { agent: 'michael', texto: 'x', wamid: 'w5', from: '593999111222' }, mkDeps()), /owner/)
const touched = Object.entries(desk.db).filter(([t, rows]) => rows.length && !['hq_orders', 'owner_outbox'].includes(t))
assert.deepEqual(touched, [])
console.log('✓ read-only: the desk wrote only hq_orders + owner_outbox')
console.log('\nALL #96 CHECKS PASSED')
