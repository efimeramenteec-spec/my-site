// netlify/lib/leadBot.mjs
//
// Lead-funnel brain — funnel v2 (#27), "answer first, then offer".
//
// Phase A = measurement: classify an inbound sender, create the `leads` row on
// first contact, honour the manual-reply pause (smb_message_echoes). Phase B is
// the conversation (#54 — plain text only, no buttons/lists): Claude (leadBrain)
// CLASSIFIES each message into ordered intents; real questions get Nicolás's
// verbatim CANNED answers FIRST; the bot then offers to show therapists ONCE;
// para quién → (edad | motivo) → gendered therapist cards (photo + caption) →
// the lead names one → the booking link (/agendar?terapeuta=). Phase C = the
// time-based follow-ups. Every inbound to a non-paused lead gets ≥1 reply or a
// derivation to Nicolás. Everything the bot SENDS is gated by LEAD_BOT_LIVE (or
// the test allow-list); recording leads is measurement and always runs.
//
// Free text is answered by a background function with no artificial delay (just
// the processing time); template quick-reply taps are answered inline.

import { normalizePhone } from './whatsapp.mjs'
import { sendText, sendImage, sendLinkText } from './waSend.mjs'
import { createBooking } from './booking.mjs'
import { notifyTherapist } from './push.mjs'
import { sendCallReminder, sendCallResult, sendRebook, sendFirstSessionNudge } from './leadTemplates.mjs'
import { decideFreeText, matchTherapistsForText, _mapa } from './leadBrain.mjs'

const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)

const FRANCISCO_ID = '2f5bf11b-42a8-562f-99c9-501c62a4ca04'
const MARIANA_ID = 'b219e764-4664-594c-9eb3-d2b19e52caac'
const APP_BASE = process.env.URL || 'https://efimeramente-panel.netlify.app'

const stripAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// The bot may SEND to a lead when it's globally live OR when that lead's phone is
// in the test allow-list (LEAD_BOT_TEST_PHONES, comma-separated, last-9 match),
// or the lead is the owner's test lead (#56, es_prueba).
export function botAllowedForPhone(phone, lead = null) {
  if (process.env.LEAD_BOT_LIVE === 'true') return true
  if (lead?.es_prueba) return true
  const list = (process.env.LEAD_BOT_TEST_PHONES || '')
    .split(',').map((s) => s.trim()).filter(Boolean).map(last9)
  return !!phone && list.includes(last9(phone))
}

function phoneMatches(rows, fromRaw) {
  const norm = normalizePhone(fromRaw)
  const l9 = last9(fromRaw)
  return (rows || []).some((r) => {
    const n = normalizePhone(r.telefono)
    return (norm && n === norm) || (l9 && last9(r.telefono) === l9)
  })
}

// True when the phone belongs to a therapist or payer. Patients are checked by
// the webhook's own patient cache before this is called.
export async function isTherapistOrPayer(supabase, fromRaw) {
  const [th, py] = await Promise.all([
    supabase.from('therapists').select('telefono'),
    supabase.from('payers').select('telefono'),
  ])
  return phoneMatches(th.data, fromRaw) || phoneMatches(py.data, fromRaw)
}

// Click-to-WhatsApp ad referral → attribution fields. ctwa_clid is the per-click
// id Meta's Conversions API (#22) keys events on — present on ~all ad messages.
export function referralOf(msg) {
  const r = msg?.referral
  if (!r) return { source: 'whatsapp_organico', ad_source_id: null, ad_headline: null, ctwa_clid: null }
  return { source: 'meta_ctwa', ad_source_id: r.source_id || null, ad_headline: r.headline || null, ctwa_clid: r.ctwa_clid || null }
}

// A first-contact ORGANIC sender (no ad referral) who already has an inbound
// message on record is a known contact, NOT a lead. Ad clicks always create a row.
async function hasEarlierInbound(supabase, from) {
  const { data } = await supabase.from('whatsapp_messages')
    .select('id').eq('direccion', 'inbound')
    .eq('raw_payload->message->>from', String(from || '')).limit(1)
  return !!(data && data.length)
}

// We contacted this number FIRST: an outbound message to them (a manual
// smb_message_echo stored by handleEchoes, or a template) exists BEFORE their
// first inbound → they're a known contact, NOT a lead. This is the second
// "not a lead" bug: Nicolás wrote payment details by hand, the person replied,
// and the bot read the reply as a brand-new lead. Compared against the current
// inbound's own timestamp (+1s skew), so a reply that arrives seconds before the
// echo is forwarded still counts us as having spoken first.
async function hasEarlierOutbound(supabase, from, beforeMs) {
  const digits = String(from || '').replace(/\D/g, '')
  if (!digits) return false
  const { data } = await supabase.from('whatsapp_messages')
    .select('received_at').eq('direccion', 'outbound')
    .eq('raw_payload->>to_digits', digits)
    .order('received_at', { ascending: true }).limit(1)
  if (!data || !data.length) return false
  if (beforeMs == null) return true
  return new Date(data[0].received_at).getTime() <= beforeMs + 1000
}

// Create the lead row on first contact, or return the existing one. Measurement
// only — sends nothing. Returns { lead, isNew } or null. esPrueba (#56): the
// owner's test lead — skips the known-contact checks, row flagged es_prueba.
export async function recordLead(supabase, { msg, contact, esPrueba = false }) {
  const phone = normalizePhone(msg.from)
  if (!phone) return null

  const { source, ad_source_id, ad_headline, ctwa_clid } = referralOf(msg)

  const { data: existing } = await supabase.from('leads').select('*').eq('phone', phone).maybeSingle()
  if (existing) {
    const patch = {}
    const waName = contact?.profile?.name
    if (waName && !existing.wa_name) patch.wa_name = waName
    // A later ad click backfills the click id if the first contact was organic (#22).
    if (ctwa_clid && !existing.ctwa_clid) patch.ctwa_clid = ctwa_clid
    // The owner phone is never a real lead (#45): in test mode its row is a test row.
    if (esPrueba && !existing.es_prueba) patch.es_prueba = true
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString()
      await supabase.from('leads').update(patch).eq('id', existing.id)
      Object.assign(existing, patch)
    }
    return { lead: existing, isNew: false }
  }

  if (source === 'whatsapp_organico' && !esPrueba) {
    if (await hasEarlierInbound(supabase, msg.from)) {
      console.log(`[lead] skip — organic known contact phone=${phone}`)
      return null
    }
    const beforeMs = msg.timestamp ? Number(msg.timestamp) * 1000 : null
    if (await hasEarlierOutbound(supabase, msg.from, beforeMs)) {
      console.log(`[lead] skip — we messaged first (outbound before inbound) phone=${phone}`)
      return null
    }
  }
  const row = { phone, wa_name: contact?.profile?.name || null, source, ad_source_id, ad_headline, ctwa_clid, stage: 'nuevo' }
  if (esPrueba) row.es_prueba = true
  const { data, error } = await supabase.from('leads').insert(row).select('*').single()
  if (error) {
    const { data: raced } = await supabase.from('leads').select('*').eq('phone', phone).maybeSingle()
    if (raced) return { lead: raced, isNew: false }
    console.error('[lead] insert failed:', error.message)
    return null
  }
  console.log(`[lead] created ${data.id} phone=${phone} source=${source}${ad_headline ? ` ad="${ad_headline}"` : ''}`)
  return { lead: data, isNew: true }
}

function echoSummary(e) {
  if (e?.type === 'text') return `[saliente] ${e.text?.body || ''}`.trim()
  return `[saliente ${e?.type || 'desconocido'}]`
}

// smb_message_echoes: a manual send from the business number → hard pause for that
// lead forever. Also the litmus test that Dualhook forwards echoes at all. Each echo
// is ALSO persisted as an `outbound` whatsapp_messages row keyed by the recipient's
// digits, so hasEarlierOutbound() can later answer "did we message this number
// before their first inbound?" (the second not-a-lead rule).
export async function handleEchoes(supabase, value) {
  const echoes = value?.message_echoes
  if (!Array.isArray(echoes) || echoes.length === 0) return 0
  let paused = 0
  const rows = []
  for (const e of echoes) {
    const to = normalizePhone(e.to)
    const toDigits = String(e.to || '').replace(/\D/g, '')
    console.log(`[wa-cloud] SMB ECHO forwarded by Dualhook — to=${e.to} type=${e.type}`)
    if (toDigits) {
      rows.push({
        direccion: 'outbound',
        twilio_sid: e.id || null, // echo wamid → dedupe (Meta retries redeliver echoes too)
        cuerpo: echoSummary(e),
        raw_payload: { echo: e, to: e.to, to_digits: toDigits, metadata: value.metadata || null },
        ...(e.timestamp ? { received_at: new Date(Number(e.timestamp) * 1000).toISOString() } : {}),
      })
    }
    if (!to) continue
    const { data: lead } = await supabase.from('leads').select('id, bot_paused, precio_visto_at').eq('phone', to).maybeSingle()
    // #40 — Nicolás quoted a price by hand → the lead has seen the price.
    if (lead && !lead.precio_visto_at && e?.type === 'text' && PRICE_RE.test(e.text?.body || '')) {
      await supabase.from('leads').update({ precio_visto_at: new Date(e.timestamp ? Number(e.timestamp) * 1000 : Date.now()).toISOString(), updated_at: new Date().toISOString() }).eq('id', lead.id)
      console.log(`[lead] ${lead.id} precio_visto_at — manual reply with a price`)
    }
    if (lead && !lead.bot_paused) {
      await supabase.from('leads').update({ bot_paused: true, updated_at: new Date().toISOString() }).eq('id', lead.id)
      paused++
      console.log(`[lead] ${lead.id} bot_paused — manual reply detected`)
    }
  }
  if (rows.length) {
    const { error } = await supabase.from('whatsapp_messages')
      .upsert(rows, { onConflict: 'twilio_sid', ignoreDuplicates: true })
    if (error) console.warn('[wa-cloud] echo store failed (non-blocking):', error.message)
  }
  return paused
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase B — the conversation (#54: no buttons, no lists, no slots). Runs only
// when botAllowedForPhone && !bot_paused. Every step is PLAIN TEXT; Claude
// (leadBrain) only CLASSIFIES the reply into ordered intents, and each intent
// runs the same function the old button tap ran. Choosing a therapist sends the
// booking link. ZERO SILENCE: a turn that ends without a send derives to Nicolás.
// All sends are best-effort; a send failure never crashes the webhook's 200.
// ─────────────────────────────────────────────────────────────────────────────

const DIAS_FULL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES_FULL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function humanDateLong(date, time) {
  const d = new Date(`${date}T00:00:00Z`)
  return `${DIAS_FULL[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES_FULL[d.getUTCMonth()]} a las ${time}`
}

function shortName(nombre) {
  if (nombre === 'Maria Gracia') return 'Ma. Gracia'
  return String(nombre || '').split(/\s+/)[0]
}
const freeCallLink = (therapistId) => `${APP_BASE}/agendar?terapeuta=${therapistId}`

// Ecuador is UTC-5, no DST. Nicolás's hours: 07:00–23:00. Outside that = night.
// The dry run pins the hour (_setHourGYE) to check the day/night copy.
let hourOverride = null
export function _setHourGYE(h) { hourOverride = h }
function ecHourNow() { return hourOverride ?? (new Date().getUTCHours() + 24 - 5) % 24 }
function isNightGYE() { const h = ecHourNow(); return h >= 23 || h < 7 }

// ── Transport — every lead-facing send of a turn goes through here, so the
// zero-silence guard can count them (lead.__sent) and the harness can swap the
// real Dualhook/push calls for a recorder (_setTransport).
const tx = { sendText, sendImage, sendLinkText, notifyTherapist }
export function _setTransport(over) { Object.assign(tx, over) }

async function txt(supabase, lead, body, { previewUrl = false, greet = true } = {}) {
  await tx.sendText(lead.phone, greet ? await withGreeting(supabase, lead, body) : body, { previewUrl })
  lead.__sent = (lead.__sent || 0) + 1
}

// #55 — ONE greeting per conversation, on the bot's first message: "Hola, hablas
// con Nico. " replaces the bubble's own "Hola!"/"Hola,"; every later bubble drops
// its "Hola" (no second greeting, no late introduction). Atomic claim on
// saludo_enviado, so two concurrent turns never both greet. A lead the bot already
// wrote to before (last_bot_at) is never introduced late.
const GREETING = 'Hola, hablas con Nico. '
const HOLA_RE = /^hola\s*[!,.]?\s*/i
async function withGreeting(supabase, lead, body) {
  const rest = String(body).replace(HOLA_RE, '')
  const bare = rest === String(body) ? rest : rest.charAt(0).toUpperCase() + rest.slice(1)
  if (lead.saludo_enviado || lead.last_bot_at) return bare
  return (await claimOnce(supabase, lead, 'saludo_enviado')) ? `${GREETING}${bare}` : bare
}

// Persist a patch and mirror it onto the in-memory lead.
async function patchLead(supabase, lead, patch) {
  patch.updated_at = new Date().toISOString()
  await supabase.from('leads').update(patch).eq('id', lead.id)
  Object.assign(lead, patch)
}

// Atomically flip a once-per-lead boolean (invitacion_enviada / saludo_enviado).
// Two messages seconds apart run as two concurrent turns; only the turn that
// wins the false→true update sends the once-only text, so it never doubles.
async function claimOnce(supabase, lead, col) {
  if (lead[col]) return false
  const { data } = await supabase.from('leads')
    .update({ [col]: true, updated_at: new Date().toISOString() })
    .eq('id', lead.id).eq(col, false).select('id')
  lead[col] = true
  return !!(data && data.length)
}

// A step's question: send it and remember it as the pending question.
async function ask(supabase, lead, text, step, extra = {}) {
  await txt(supabase, lead, text)
  await patchLead(supabase, lead, { step_actual: step, last_bot_text: text, last_bot_at: new Date().toISOString(), parse_misses: 0, ...extra })
}

// Fire-and-forget heads-up to Nicolás (owner push, no bot pause). Used by the
// safety nets so a lead never sits unanswered for hours again.
async function pushNicolas(supabase, lead, { title, body }) {
  try {
    await tx.notifyTherapist(supabase, null, { title, body, url: '/marketing' })
  } catch (e) { console.warn('[bot] pushNicolas failed:', e.message) }
}
const STAGE_TS = {
  toco: 'toco_at', eligio_terapeuta: 'eligio_terapeuta_at', agendo: 'agendo_at',
  llamada_hecha: 'llamada_hecha_at', no_contesto: 'no_contesto_at', paciente: 'paciente_at', frio: 'frio_at',
}
const CORE = { nuevo: 0, toco: 1, eligio_terapeuta: 2, agendo: 3 }
async function advanceStage(supabase, lead, stage) {
  const patch = {}
  const cur = CORE[lead.stage]
  const next = CORE[stage]
  if (cur != null && next != null) { if (next > cur) patch.stage = stage }
  else patch.stage = stage
  const ts = STAGE_TS[stage]
  if (ts && !lead[ts]) patch[ts] = new Date().toISOString()
  if (Object.keys(patch).length) await patchLead(supabase, lead, patch)
}

// Pull a tap (button/list reply) out of an inbound message, else null (= free
// text). The bot no longer SENDS buttons, but template quick-replies (Confirmo,
// Cambiar hora, …) and taps on buttons still sitting in old chats arrive as taps.
function extractTap(msg) {
  if (msg?.type === 'interactive') {
    const i = msg.interactive
    if (i?.button_reply?.id) return { id: i.button_reply.id, title: i.button_reply.title }
    if (i?.list_reply?.id) return { id: i.list_reply.id, title: i.list_reply.title }
  }
  if (msg?.type === 'button' && msg.button?.payload) return { id: msg.button.payload, title: msg.button.text }
  return null
}
// The webhook uses this to decide inline (tap) vs background (text) handling.
export function isTap(msg) { return !!extractTap(msg) }

// ── The one-time invitation ("answer first, then offer") ─────────────────────
const INVITATION = '*Te gustaría ver a nuestros terapeutas disponibles?*'
// Offer to show therapists — ONCE per conversation (atomic claim). No-op if sent.
async function sendInvitationOnce(supabase, lead) {
  if (!(await claimOnce(supabase, lead, 'invitacion_enviada'))) return false
  await ask(supabase, lead, INVITATION, 'answered')
  return true
}

// ── Verbatim answers (Nicolás's wording, #27) — the SOURCE OF TRUTH ───────────
// Claude (leadBrain) only CLASSIFIES the intent; the code sends this exact copy,
// one WhatsApp bubble per array item, so the wording can never drift. `end`:
//   'invite'        → after the answers, the one-time invitation.
//   'invite_custom' → the LAST bubble is itself the question ("Deseas ver sus
//                     perfiles?") — counts as the invitation.
//   'cards'         → after the bubble, render `categoria`'s cards (no invitation).
//   'handoff'       → after the bubble, escalate to Nicolás (he negotiates) + pause.
const MAPS_LINK = 'https://maps.app.goo.gl/GZAFUpC1SAyW8GBT8'
const CANNED = {
  precio: { end: 'invite', bubbles: [
    { text: 'Hola! La sesión cuesta $39, también tenemos paquetes de 4 sesiones por $35 c/u' },
    { text: 'Aceptamos tarjeta' },
    { text: 'Muchos seguros privados reembolsan la terapia — Nosotros te ayudamos con el trámite' },
  ] },
  ubicacion: { end: 'invite', bubbles: [
    { text: MAPS_LINK, preview: true },
    { text: 'Estamos en Cumbayá, a 3 minutos del Scala' },
    { text: 'También atendemos online.' },
  ] },
  saludsa: { end: 'invite', bubbles: [
    { text: 'Sí, Saludsa te cubre por reembolso. Avísanos cuando hayas terminado tu primera sesión y te ayudamos con el trámite' },
  ] },
  seguros: { end: 'invite', bubbles: [
    { text: 'Muchos seguros privados reembolsan la terapia según tu plan. Bupa y Humana reembolsan hasta el 80%, con un tope anual según tu plan. Saludsa y Ecuasanitas también cubren por reembolso. Te damos la factura con el formato que piden y te ayudamos con el trámite.' },
  ] },
  adolescentes: { end: 'invite_custom', categoria: 'hijo', bubbles: [
    { text: 'Sí, tenemos varios psicólogos expertos en terapia juvenil. Deseas ver sus perfiles?' },
  ] },
  duracion: { end: 'invite', bubbles: [
    { text: 'Las sesiones individuales duran una hora. La frecuencia puede ser cada 7 o cada 15 días, según tu preferencia y la recomendación del psicólogo después de tu primera sesión' },
  ] },
  horarios: { end: 'invite', bubbles: [
    { text: 'Sí, trabajamos de Lunes a Sábado, de 8am a 8pm. Siempre en coordinación con tu terapeuta y con previa cita.' },
  ] },
  psiquiatra: { end: 'invite', bubbles: [
    { text: 'No tenemos un psiquiatra propio del centro, pero trabajamos en conjunto con el Dr. Camino cuando el caso lo requiere. Se hace una valoración psicológica primero, y luego derivamos al Dr. Camino, si se recomienda medicación.' },
  ] },
  pareja: { end: 'cards', categoria: 'terapia_pareja', bubbles: [
    { text: 'Sí, tenemos una psicóloga especialista, Carolina Almeida. Las sesiones de pareja duran una hora y media, y tienen un valor de $50. También puedes acceder a un paquete de 4 sesiones por $42 cada una' },
  ] },
  pago: { end: 'invite', bubbles: [
    { text: 'Recibirás un recordatorio de pago 2 días *después de la sesión*, con los datos de pago. Aceptamos transferencias y pagos con tarjeta.' },
  ] },
  objecion_precio: { end: 'handoff', bubbles: [
    { text: 'Te entiendo totalmente. Me podrías decir qué presupuesto tenías en mente?' },
  ] },
}

// #40 — the CAPI LeadSubmitted signal is "kept talking after seeing the price".
// Stamp precio_visto_at (once) whenever the lead is shown a price.
const PRICE_CANNED = new Set(['precio', 'pareja'])
export const PRICE_RE = /\$\s?\d/
async function markPrecioVisto(supabase, lead) {
  if (lead.precio_visto_at) return
  await patchLead(supabase, lead, { precio_visto_at: new Date().toISOString() })
}

// Just the bubbles of a canned answer (no tail). Returns the answer's `end`.
async function sendBubbles(supabase, lead, key) {
  const c = CANNED[key]
  if (c.categoria) await patchLead(supabase, lead, { categoria: c.categoria })
  if (PRICE_CANNED.has(key)) await markPrecioVisto(supabase, lead)
  for (const b of c.bubbles) await txt(supabase, lead, b.text, { previewUrl: !!b.preview })
  await patchLead(supabase, lead, { last_bot_at: new Date().toISOString() })
  if (c.end === 'invite_custom') {
    // The last bubble IS the invitation question.
    await claimOnce(supabase, lead, 'invitacion_enviada')
    await patchLead(supabase, lead, { step_actual: 'answered', last_bot_text: c.bubbles[c.bubbles.length - 1].text })
  }
  return c.end
}

// One canned answer + its tail (the single-answer path: chooseQuien 'pareja').
async function sendCanned(supabase, lead, key) {
  return finishAnswers(supabase, lead, [await sendBubbles(supabase, lead, key)])
}

// Run the tail of one or more canned answers ONCE: a handoff wins; then cards;
// then (if any answer asked for it) the one-time invitation — or, when the lead
// is already mid-flow, the step's pending question again.
async function finishAnswers(supabase, lead, ends) {
  if (ends.includes('handoff')) return escalate(supabase, lead, 'objecion_precio') // line sent; Nicolás negotiates
  if (ends.includes('cards')) return showCards(supabase, lead, 'terapia_pareja') // pareja → Carolina, no invitation
  if (!ends.includes('invite')) return
  if (!inFlow(lead)) {
    if (await sendInvitationOnce(supabase, lead)) return
    return patchLead(supabase, lead, { step_actual: lead.step_actual || 'answered', parse_misses: 0 })
  }
  return askPending(supabase, lead)
}

// The lead is past the opening and a step question is waiting for an answer.
const FLOW_STEPS = new Set(['quien', 'edad', 'reasons', 'diagnostico_prompt', 'varios_prompt', 'cards'])
const inFlow = (lead) => FLOW_STEPS.has(lead.step_actual)

// ── Keyword classification (deterministic, free) — the fallback when the model
// is unavailable (no key / error / timeout). "domicilio" is deliberately NOT a
// location keyword — home visits aren't offered, so they derive to a person.
const YES_RE = /^(si+|sip|dale|ok|okay|okey|claro|claro que si|bueno|va|vale|de una|por supuesto|me gustaria|si me gustaria|si por favor|si porfa|si gracias|ok si|si claro|claro si|perfecto si|si quiero|si dale)( por ?favor| porfa| gracias)?$/
const NO_RE = /^(no+|no gracias|todavia no|aun no|ahora no|por ahora no|no por ahora)( gracias)?$/
function classifyKeywords(text, { step } = {}) {
  const n = normText(text)
  const t = ` ${String(text || '').toLowerCase()} `
  const has = (re) => re.test(t)
  const out = []
  const add = (intent, valor = '') => { if (!out.some((i) => i.intent === intent)) out.push({ intent, valor }) }
  if (YES_RE.test(n)) add('afirmativo')
  else if (NO_RE.test(n)) add('negativo')
  if (has(/cu[aá]nto (cuesta|vale|es|cobran|sale|cuestan)|cuesta|costo|valor|precio|tarifa|evaluaci[oó]n/)) add('precio')
  if (has(/d[oó]nde|ubica|direcci[oó]n|queda|presencial|online|virtual|parqueadero/)) add('ubicacion')
  if (has(/seguro|aseguradora|reembolso|cobertura/)) add('seguros')
  if (has(/tarjeta|transferencia|pagar|paquete/)) add('pago')
  if (has(/\bdura\b|duraci[oó]n|frecuencia|cada cu[aá]nto/)) add('duracion')
  if (has(/pareja|espos[oa]|novi[oa]|matrimonio/) && has(/terapia|sesi[oó]n|juntos|los dos|ambos|busco|pareja y yo/)) add('pareja')
  else if (/\b(en pareja|mi pareja y yo|para los dos|para ambos)\b/.test(n)) add('quien_pareja')
  const askingWho = !step || step === 'quien' || step === 'answered'
  if (/\b(mi hij[oa]|mis hij[oa]s|para mi hij[oa]|mi nin[oa]|mi peque[nñ][oa])\b/.test(n)) add('quien_hijo')
  else if (askingWho && /\b(para mi|para mi misma|para mi mismo|yo|soy yo)\b/.test(n) && n.split(' ').length <= 5) add('quien_yo')
  const age = _mapa.readSignals(text).edad
  if (age != null) add('edad', String(age))
  else if (step === 'edad' && /^\d{1,2}( anos?)?$/.test(n)) add('edad', n.match(/\d{1,2}/)[0])
  if (!out.length && has(/gracias|\bok\b|perfecto|jaja|listo|genial|entiendo|\bya\b/)) add('gracias')
  if (!out.length && has(/hola|buen[oa]s|buen d[ií]a|saludos|\bhey\b|que tal/) && isBareGreeting(text)) add('saludo')
  return out
}

// LLM fallback classifier (APIMart) — used only when the Anthropic brain is down
// AND the keywords found nothing.
async function classifyFreeText(text) {
  const apiKey = process.env.APIMART_API_KEY
  if (!apiKey) return null
  const prompt = `Clasifica el mensaje de un posible paciente de una consulta psicológica en EXACTAMENTE una categoría y responde SOLO con la palabra:
precio, ubicacion, seguro, pago, otro.
Mensaje: "${String(text).replace(/"/g, "'").slice(0, 500)}"`
  try {
    const res = await fetch('https://api.apimart.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-4-8', stream: false, max_tokens: 8, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) { console.error('[bot] classify APIMart', res.status); return null }
    const data = await res.json()
    const raw = data?.choices?.[0]?.message?.content
    const out = (typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map((p) => p?.text || '').join('') : '').toLowerCase()
    const m = out.match(/precio|ubicaci[oó]n|seguro|pago|otro/)
    if (!m) return null
    const k = m[0].startsWith('ubicaci') ? 'ubicacion' : m[0] === 'seguro' ? 'seguros' : m[0]
    return k === 'otro' ? null : k
  } catch (e) { console.error('[bot] classify failed:', e.message); return null }
}

// ── Escalate + handoff ───────────────────────────────────────────────────────
// escalate: push to Nicolás + pause the bot for this lead forever. Marks the turn
// as derived (lead.__derived) for the zero-silence guard.
async function escalate(supabase, lead, reason, { urgent = false, title = null, body = null } = {}) {
  await patchLead(supabase, lead, { bot_paused: true })
  lead.__derived = true
  try {
    await tx.notifyTherapist(supabase, lead.therapist_id || null, {
      title: title || (urgent ? '🚨 URGENTE — lead necesita atención' : 'Lead necesita atención 🌿'),
      body: body || `${lead.wa_name || lead.phone} — ${reason}`,
      url: '/marketing',
    })
  } catch (e) { console.warn('[bot] escalate push failed:', e.message) }
  console.log(`[bot] lead ${lead.id} escalated (${reason})${urgent ? ' URGENTE' : ''} + paused`)
}

// Non-urgent handoff to a human (#54 zero silence, #55 first person — the bot IS
// Nico): one line, then push + pause. Day (07:00–23:00 GYE) / night copy approved
// by Nicolás. botQuestion ("eres un bot?") → ZERO text at any hour, push with the
// lead's words; Nicolás answers with an audio.
async function handoff(supabase, lead, reason, { botQuestion = false, text = '' } = {}) {
  if (botQuestion) {
    return escalate(supabase, lead, reason, { title: 'Preguntó si es un bot', body: `${lead.wa_name || lead.phone}: "${String(text).slice(0, 300)}"` })
  }
  const line = isNightGYE() ? 'Te respondo mañana a primera hora.' : 'Dame un momento y te respondo.'
  try { await txt(supabase, lead, line) } catch (e) { console.warn('[bot] handoff line failed:', e.message) }
  await escalate(supabase, lead, reason)
}

// "Eres un bot?" / "estoy hablando con una persona?" — deterministic, before the
// model, so it never depends on the classifier (which also tags it motivo "bot").
const BOT_Q = [
  /\b(bot|chatbot|robot)\b/,
  /\b(eres|sos|es) (un |una )?(ia|inteligencia artificial|maquina|contestadora|automatic[oa]|sistema automatico)\b/,
  /\b(eres|sos) (un |una )?(persona|humano|humana|real|alguien real)\b/,
  /\b(hablo|hablando|habla|hablamos|chateando|escribiendo|escribo|converso|conversando) con (un |una )?(persona|humano|humana|bot|chatbot|robot|ia|maquina|alguien real|sistema)\b/,
  /\brespuestas? automaticas?\b|\bmensajes? automaticos?\b|\bpersona real\b/,
]
export function isBotQuestion(text) {
  const t = stripAccents(text)
  return BOT_Q.some((re) => re.test(t))
}

// Append a decision to the audit log (Marketing → Embudo). Best-effort.
async function logDecision(supabase, lead, { text, accion, motivo, reply, model, latencyMs, fallback = false }) {
  try {
    await supabase.from('lead_ai_decisions').insert({
      lead_id: lead.id,
      phone: lead.phone,
      texto_in: String(text || '').slice(0, 1000),
      accion,
      motivo: motivo || null,
      reply: reply ? String(reply).slice(0, 1000) : null,
      step: lead.step_actual || null,
      model: fallback ? 'keyword' : (model || null),
      latency_ms: latencyMs ?? null,
      used_fallback: fallback,
      es_prueba: !!lead.es_prueba,
    })
  } catch (e) { console.warn('[bot] logDecision failed:', e.message) }
}

// ── Reason question (its answer goes to matchFlow) ────────────────────────────
const REASON_Q = 'Perfecto. Qué te trae a terapia?'
async function showReasonList(supabase, lead) {
  await advanceStage(supabase, lead, 'toco')
  await ask(supabase, lead, REASON_Q, 'reasons')
}

// ── First question (#37): who is the therapy for? ──────────────────────────────
// Para mí → reason question · En pareja → Carolina · Hijo/a → age.
const QUIEN_Q = 'Cuéntame, para quién buscas empezar terapia? Para ti, en pareja o para tu hijo/a?'
async function showQuien(supabase, lead) {
  await advanceStage(supabase, lead, 'toco')
  await txt(supabase, lead, QUIEN_Q) // greeted by txt() only if it's the first message
  await patchLead(supabase, lead, { step_actual: 'quien', last_bot_text: QUIEN_Q, last_bot_at: new Date().toISOString(), parse_misses: 0 })
}

async function chooseQuien(supabase, lead, who) {
  await advanceStage(supabase, lead, 'toco')
  if (who === 'yo') { await patchLead(supabase, lead, { quien: 'yo' }); return showReasonList(supabase, lead) }
  if (who === 'pareja') { await patchLead(supabase, lead, { quien: 'pareja' }); return sendCanned(supabase, lead, 'pareja') }
  if (who === 'hijo') return askEdad(supabase, lead)
  return showQuien(supabase, lead)
}

// Hijo/a (or any path landing on categoria 'hijo') → age first, then the
// age-split routing rows (hidden categories hijo_nino / hijo_adolescente / hijo_adulto).
const EDAD_Q = 'Qué edad tiene tu hijo/a?'
const EDAD = {
  nino: { clave: 'hijo_nino', intro: 'Ok perfecto, te dejo los perfiles de nuestros expertos en terapia infantil.' },
  adolescente: { clave: 'hijo_adolescente', intro: 'Ok perfecto, te dejo los perfiles de nuestros expertos en terapia juvenil.' },
  adulto: { clave: 'hijo_adulto', intro: 'Ok perfecto, te dejo los perfiles de nuestros expertos en terapia para jóvenes adultos.' },
}
const edadKey = (n) => (n < 12 ? 'nino' : n < 18 ? 'adolescente' : 'adulto')
async function askEdad(supabase, lead) {
  await advanceStage(supabase, lead, 'toco')
  await ask(supabase, lead, EDAD_Q, 'edad', { quien: 'hijo', categoria: 'hijo' })
}
async function chooseEdad(supabase, lead, key) {
  const e = EDAD[key]
  if (!e) return askEdad(supabase, lead)
  await advanceStage(supabase, lead, 'toco')
  await patchLead(supabase, lead, { quien: 'hijo', categoria: e.clave })
  return renderCards(supabase, lead, await resolveCards(supabase, e.clave), { intro: e.intro })
}

// The bookable therapist pool (recibe_nuevos + active), with the fields cards +
// matching need.
async function bookableRoster(supabase) {
  const { data } = await supabase.from('therapists')
    .select('id, nombre, apellido, genero, funnel_caption, funnel_card_url, booking_availability, calendar_email')
    .eq('recibe_nuevos', true).eq('activo', true)
  return data || []
}

// Fixed ordered routing for a category, filtered to the bookable pool (off
// therapists drop, others move up), capped at 3, Francisco never bumped off.
async function resolveCards(supabase, clave) {
  const { data: cat } = await supabase.from('funnel_categorias').select('*').eq('clave', clave).maybeSingle()
  if (!cat) return []
  const pool = await bookableRoster(supabase)
  const byId = new Map(pool.map((t) => [t.id, t]))
  const ordered = (cat.terapeutas || []).map((id) => byId.get(id)).filter(Boolean)
  const top = ordered.slice(0, 3)
  const franIdx = ordered.findIndex((t) => t.id === FRANCISCO_ID)
  if (franIdx >= 3 && !top.some((t) => t.id === FRANCISCO_ID)) top[2] = ordered[franIdx] // never bump Francisco
  return top
}

// Caption for a card: drop the "Enfoque …" clinical clause (spec: cards show areas,
// not the approach).
function captionSansEnfoque(caption) {
  const i = String(caption || '').search(/Enfoque/i)
  return (i >= 0 ? String(caption).slice(0, i) : String(caption || '')).trim()
}

// Render the resolved therapist cards: photo + name + caption + the gendered
// line. No button — the lead answers with a name (elige_terapeuta).
async function renderCards(supabase, lead, therapists, { intro } = {}) {
  if (!therapists.length) {
    await txt(supabase, lead, 'En este momento no tengo terapeutas disponibles para ese tema. Escríbenos y te ayudamos directamente.')
    return escalate(supabase, lead, 'sin_terapeutas')
  }
  await txt(supabase, lead, intro || 'Aquí tienes a los profesionales especializados en tu motivo de consulta.')
  for (const t of therapists) {
    const line = t.genero === 'M' ? '*Puedes agendar una llamada gratuita para conocerlo*' : '*Puedes agendar una llamada gratuita para conocerla*'
    const caption = captionSansEnfoque(t.funnel_caption)
    await tx.sendImage(lead.phone, {
      imageLink: t.funnel_card_url || null,
      caption: `*${t.nombre} ${t.apellido}*${caption ? `\n${caption}` : ''}\n\n${line}`,
    })
    lead.__sent = (lead.__sent || 0) + 1
  }
  await patchLead(supabase, lead, {
    step_actual: 'cards', cards_ofrecidas: therapists.map((t) => t.id),
    last_bot_text: null, last_bot_at: new Date().toISOString(), parse_misses: 0,
  })
}

async function showCards(supabase, lead, clave) {
  const cards = await resolveCards(supabase, clave)
  return renderCards(supabase, lead, cards)
}

// A reason was chosen (detected). Special reasons branch off; the rest show cards.
async function chooseReason(supabase, lead, clave) {
  if (clave === 'hijo') return askEdad(supabase, lead) // age split replaces the old 'hijo' cards
  // No activo filter: hidden rows (terapia_pareja, hijo_*) still route when reached
  // by another path (Claude-detected categoria, invitation "Sí").
  const { data: cat } = await supabase.from('funnel_categorias').select('*').eq('clave', clave).maybeSingle()
  if (!cat) return showQuien(supabase, lead)
  await advanceStage(supabase, lead, 'toco')
  await patchLead(supabase, lead, { categoria: clave })
  if (cat.especial === 'otro') return handoff(supabase, lead, 'motivo_otro')
  if (cat.especial === 'diagnostico') return ask(supabase, lead, DIAG_Q, 'diagnostico_prompt')
  if (cat.especial === 'varios') return ask(supabase, lead, VARIOS_Q, 'varios_prompt')
  return showCards(supabase, lead, clave)
}
const DIAG_Q = 'Cuéntame qué diagnóstico tienes o sospechas. Puedes escribirlo o mandar un audio.'
const VARIOS_Q = 'Por favor cuéntame qué te trajo a terapia? Siéntete libre de enviar un audio si te resulta mejor.'

// The lead described their motive (answer to "Qué te trae a terapia?", or a
// diagnosis / several motives): Claude matches it to the roster → cards, or
// derives to Nicolás (no fit / eating disorder / psychosis / bipolar / self-harm /
// long-emotional / unclear). Falls back to a handoff if the model is unavailable.
async function matchFlow(supabase, lead, text, mode) {
  const roster = await bookableRoster(supabase)
  let res = null
  try {
    res = await matchTherapistsForText({ roster: roster.map((t) => ({ nombre: t.nombre, caption: t.funnel_caption })), text, mode })
  } catch (e) { console.warn('[bot] matchFlow model failed:', e.message) }
  if (!res) { // model down → hand to a person
    await logDecision(supabase, lead, { text, accion: 'derivar', motivo: `match_${mode}_sinmodelo`, reply: null, fallback: true })
    return handoff(supabase, lead, `match_${mode}_sinmodelo`)
  }
  if (res.accion === 'derivar') {
    await logDecision(supabase, lead, { text, accion: 'derivar', motivo: `match_${mode}_${res.motivo}`, reply: null, model: res.model, latencyMs: res.latencyMs })
    return handoff(supabase, lead, `match_${mode}_${res.motivo || 'derivar'}`)
  }
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/\s+/)[0]
  const chosen = []
  for (const name of res.nombres) {
    const t = roster.find((r) => norm(r.nombre) === norm(name) && !chosen.some((c) => c.id === r.id))
    if (t) chosen.push(t)
  }
  if (!chosen.length) {
    await logDecision(supabase, lead, { text, accion: 'derivar', motivo: `match_${mode}_sin_fit`, reply: null, model: res.model, latencyMs: res.latencyMs })
    return handoff(supabase, lead, `match_${mode}_sin_fit`)
  }
  await logDecision(supabase, lead, { text, accion: 'cards', motivo: `match_${mode}: ${chosen.map((t) => t.nombre).join(', ')}`, reply: null, model: res.model, latencyMs: res.latencyMs })
  return renderCards(supabase, lead, chosen.slice(0, 3))
}

// ── Named therapist (deterministic, model-independent) ────────────────────────
// The live bug: the model once called "quiero empezar mi cita con la Dra. Carolina
// Almeida" a `saludo`. matchTherapistInText runs on every message so a named
// therapist is caught reliably, free, even for therapists the model can't see
// (Mariana / Daniela don't receive new patients).

// All active therapists, with the fields a card + routing decision need.
async function allTherapists(supabase) {
  const { data } = await supabase.from('therapists')
    .select('id, nombre, apellido, genero, recibe_nuevos, activo, funnel_caption, funnel_card_url')
    .eq('activo', true)
  return data || []
}

// Find a therapist named in free text: full "nombre apellido" first, then apellido
// alone, then a significant (≥5-char) first-name token — all accent-insensitive on
// word boundaries. Returns the therapist row or null.
function matchTherapistInText(therapists, text) {
  const t = ` ${stripAccents(text).replace(/[^a-z0-9]+/g, ' ').trim()} `
  const inT = (needle) => needle && t.includes(` ${needle} `)
  for (const th of therapists) { if (inT(stripAccents(`${th.nombre} ${th.apellido}`))) return th }
  for (const th of therapists) { const ap = stripAccents(th.apellido); if (ap.length >= 4 && inT(ap)) return th }
  for (const th of therapists) {
    for (const w of stripAccents(th.nombre).split(' ')) { if (w.length >= 5 && inT(w)) return th }
  }
  return null
}

// Plain booking intent with NO therapist named ("quiero agendar mi primera cita").
function isAgendarText(text) {
  const t = stripAccents(text)
  if (/\b(agendar|agende|agenda|agendemos|reservar|reserva|turno|cita|citas)\b/.test(t)) return true
  if (/quiero empezar|empezar (mi |la )?(terapia|sesion|proceso)|empezar a ir/.test(t)) return true
  return false
}

// A therapist was chosen (by name, at any step). Closed therapists (Mariana /
// Daniela) → a person coordinates; bookable ones → the booking link. Naming one
// before seeing the cards still pings Nicolás (safety net a).
async function pickTherapist(supabase, lead, t, text) {
  if (!t.recibe_nuevos || t.id === MARIANA_ID) {
    await advanceStage(supabase, lead, 'toco')
    await txt(supabase, lead, `Gracias por tu interés en ${shortName(t.nombre)}. Déjame coordinar esto contigo por aquí.`)
    return escalate(supabase, lead, `terapeuta_nombrado:${t.nombre} ${t.apellido} (no recibe nuevos)`)
  }
  if (lead.step_actual !== 'cards') {
    await pushNicolas(supabase, lead, {
      title: 'Lead pidió un terapeuta por nombre 🌿',
      body: `${lead.wa_name || lead.phone} → ${t.nombre} ${t.apellido}`,
    })
  }
  return chooseTherapist(supabase, lead, t.id)
}

// Resolve a therapist by a free-form name string (the model's `valor`), against
// ALL active therapists. Returns the row or null.
async function resolveTherapistByName(supabase, nameText) {
  if (!nameText) return null
  return matchTherapistInText(await allTherapists(supabase), nameText)
}

// ── The booking link (#54 — replaces the slot list) ───────────────────────────
// Nicolás's approved copy, verbatim; the ONLY lead-bot text that keeps its emoji
// (sendLinkText skips the sanitizer). The link goes on its own line.
export const LINK_COPY = 'Aquí te dejo el link para agendar la llamada gratuita. Escoge el día y hora que prefieras, el terapeuta te contactará vía whatsapp al momento de la llamada.\nGracias por la confianza❤️‍🩹'
async function sendBookingLink(supabase, lead, therapistId) {
  await tx.sendLinkText(lead.phone, `${await withGreeting(supabase, lead, LINK_COPY)}\n${freeCallLink(therapistId)}`)
  lead.__sent = (lead.__sent || 0) + 1
  await patchLead(supabase, lead, { step_actual: 'link_enviado', last_bot_text: null, last_bot_at: new Date().toISOString(), parse_misses: 0 })
}

// A therapist was chosen (the interest signal → CAPI LeadSubmitted via
// eligio_terapeuta_at). Send the booking link; a booking made from it links back
// to this lead by the last-9 DB triggers (#34) → agendo_at.
async function chooseTherapist(supabase, lead, therapistId) {
  const { data: t } = await supabase.from('therapists')
    .select('id, nombre, apellido, genero, activo').eq('id', therapistId).maybeSingle()
  if (!t || !t.activo) {
    await txt(supabase, lead, 'Esa opción ya no está disponible. Elige otra, por favor.')
    return askPending(supabase, lead)
  }
  await advanceStage(supabase, lead, 'eligio_terapeuta')
  await patchLead(supabase, lead, { therapist_id: therapistId })
  return sendBookingLink(supabase, lead, therapistId)
}

// Legacy tap on a slot row still sitting in an old chat → book it as before.
async function bookSlot(supabase, lead, rest) {
  const [therapistId, date, time] = String(rest).split('|')
  const { data: t } = await supabase.from('therapists')
    .select('id, nombre, apellido, booking_availability, calendar_email').eq('id', therapistId).maybeSingle()
  if (!t) { await txt(supabase, lead, 'Ese horario ya no está disponible.'); return askPending(supabase, lead) }

  const name = String(lead.wa_name || '').trim()
  const [nombre, ...apParts] = name.split(/\s+/)
  const result = await createBooking(supabase, {
    therapist: t, date, startTime: time, kindKey: 'llamada', modalidad: 'en_linea',
    patient: { nombre: nombre || 'Lead', apellido: apParts.join(' '), telefono: lead.phone },
    esLead: true, fuente: lead.source, prueba: !!lead.es_prueba,
  })
  if (!result.ok) {
    if (result.error === 'slot_taken') return sendBookingLink(supabase, lead, t.id)
    await txt(supabase, lead, 'No pude agendar en este momento. Escríbenos y te ayudamos.')
    return escalate(supabase, lead, `booking_${result.error}`)
  }
  await advanceStage(supabase, lead, 'agendo')
  await patchLead(supabase, lead, {
    session_id: result.sessionId, patient_id: result.patientId,
    step_actual: 'agendado', last_bot_at: new Date().toISOString(), parse_misses: 0,
  })
  await txt(supabase, lead,
    `Listo! Tu llamada gratuita con ${shortName(t.nombre)} es el ${humanDateLong(date, time)}.
Te llamará a este número.
Si necesitas cambiarla, escríbenos por aquí.`)
}

// ── The pending question of the current step ──────────────────────────────────
// What the bot is waiting for (the model's context) and what it repeats after a
// greeting / thanks / stray media mid-flow.
const CARDS_Q = 'Con quién te gustaría agendar tu llamada gratuita?'
function pendingQuestion(lead) {
  switch (lead.step_actual) {
    case 'quien': return QUIEN_Q
    case 'edad': return EDAD_Q
    case 'reasons': return REASON_Q
    case 'diagnostico_prompt': return DIAG_Q
    case 'varios_prompt': return VARIOS_Q
    case 'cards': return CARDS_Q
    case 'answered': return lead.invitacion_enviada ? (lead.last_bot_text || INVITATION) : null
    case 'pregunta_abierta': return 'Claro, dime'
    default: return null
  }
}

// Repeat the step's pending question. Nothing pending → the opening question
// for a fresh lead; after the link / booking → a short "Con gusto!".
async function askPending(supabase, lead) {
  const q = pendingQuestion(lead)
  if (q) {
    await txt(supabase, lead, lead.step_actual === 'reasons' ? 'Qué te trae a terapia?' : q)
    return patchLead(supabase, lead, { last_bot_at: new Date().toISOString() })
  }
  if (['link_enviado', 'agendado'].includes(lead.step_actual)) {
    await txt(supabase, lead, 'Con gusto!')
    return patchLead(supabase, lead, { last_bot_at: new Date().toISOString() })
  }
  return showQuien(supabase, lead)
}

// Therapist names on offer (the cards the lead is looking at), for the model.
async function offeredNames(supabase, lead) {
  const ids = Array.isArray(lead.cards_ofrecidas) ? lead.cards_ofrecidas : []
  if (!ids.length) return []
  const { data } = await supabase.from('therapists').select('id, nombre, apellido').in('id', ids)
  return (data || []).map((t) => `${t.nombre} ${t.apellido}`)
}

// Recent inbound lines from this chat (oldest first), for the model context.
async function recentInbound(supabase, phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return []
  const { data } = await supabase.from('whatsapp_messages')
    .select('cuerpo, received_at').eq('direccion', 'inbound')
    .eq('raw_payload->message->>from', digits)
    .order('received_at', { ascending: false }).limit(12)
  return (data || [])
    .map((r) => (r.cuerpo || '').trim())
    .filter((c) => c && !c.startsWith('['))
    .reverse()
}

// Safety net (b): the lead went quiet > 1h and is writing again without having
// moved past the start of the funnel → heads-up to Nicolás (bot still replies).
async function maybeReengagePush(supabase, lead) {
  if (!lead.last_bot_at) return
  if (!['nuevo', 'toco', 'eligio_terapeuta'].includes(lead.stage)) return
  if (Date.now() - new Date(lead.last_bot_at).getTime() < 60 * 60 * 1000) return
  await pushNicolas(supabase, lead, {
    title: 'Lead volvió a escribir 🌿',
    body: `${lead.wa_name || lead.phone} escribió de nuevo tras +1h sin avanzar`,
  })
}

// Safety net (c): 3+ inbound messages and still on the starting step → ping Nicolás
// once (stuck_push_at). Signals the bot is failing to move this lead forward.
async function maybeStuckPush(supabase, lead, history) {
  if (lead.stuck_push_at) return
  if (![null, undefined, '', 'reasons', 'quien'].includes(lead.step_actual)) return
  if (history.length < 3) return
  await pushNicolas(supabase, lead, {
    title: 'Lead atascado en el inicio 🌿',
    body: `${lead.wa_name || lead.phone} lleva ${history.length} mensajes sin avanzar`,
  })
  await patchLead(supabase, lead, { stuck_push_at: new Date().toISOString() })
}

// A BARE greeting is just "hola" / "buenas" with nothing substantive. A greeting
// that carries a motive ("hola, es para mi hijo de 15") is NOT bare.
function isBareGreeting(text) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const stripped = t
    .replace(/buen[oa]?s?/g, '')
    .replace(/d[ií]as?|dias?|tardes?|noches?/g, '')
    .replace(/hola|holaa+|ola|hey|hi|saludos|que tal|klk/g, '')
    .replace(/[^a-z0-9]/g, '')
  return stripped.length < 4
}

// Ad prefills + "más información" — deterministic, never the model (#37).
const normText = (text) => stripAccents(text).replace(/[^a-z0-9]+/g, ' ').trim()
const PREFILL_EMPEZAR = /^(hola )?(me gustaria|quiero|quisiera) empezar (una |la )?terapia( con ustedes)?( por ?favor)?$/
const PREFILL_PRECIO = /^(hola )?(quiero|quisiera|me gustaria) saber (el |los |sobre el |sobre los )?precios?( por ?favor)?$/
const MAS_INFO = /^(hola )?((quiero|quisiera|me gustaria|me das|puedes darme|podrias darme) )?((recibir|tener) )?(mas )?(informacion|info)( por ?favor| porfa)?$/
export function prefillKind(text) {
  const t = normText(text)
  if (PREFILL_EMPEZAR.test(t)) return 'empezar'
  if (PREFILL_PRECIO.test(t)) return 'precio'
  if (MAS_INFO.test(t)) return 'info'
  return null
}

// Template quick-replies typed as text (#54 point 9) — the same result as the
// tap, but only when that template was actually sent to this lead.
function typedTemplateReply(lead, text) {
  const n = normText(text)
  if (lead.recordatorio_llamada_at && /^(confirmo|confirmado|si confirmo)$/.test(n)) return 'Confirmo'
  if (lead.recordatorio_llamada_at && /^(cambiar (la )?hora|quiero cambiar (la )?hora)$/.test(n)) return 'Cambiar hora'
  if (lead.rebook_sent_at && /^(si )?reagendar$|^si quiero reagendar$/.test(n)) return 'Sí, reagendar'
  if (lead.nudge48_sent_at && /^si quiero agendar$/.test(n)) return 'Sí, quiero agendar'
  return null
}

// ── T2 — free text (#54) ──────────────────────────────────────────────────────
// Deterministic rules first (prefills, typed template replies), then Claude
// classifies into ordered intents (keyword fallback if the model is down), a
// named therapist found deterministically is merged in, and runIntents answers.
async function handleFreeText(supabase, lead, text, { firstTouch = false } = {}) {
  const typed = typedTemplateReply(lead, text)
  if (typed) {
    await logDecision(supabase, lead, { text, accion: 'responder', motivo: `plantilla_texto:${typed}`, reply: null, model: 'regla' })
    return handleTap(supabase, lead, { id: typed })
  }

  if (isBotQuestion(text)) {
    await logDecision(supabase, lead, { text, accion: 'derivar', motivo: 'bot', reply: null, model: 'regla' })
    return handoff(supabase, lead, 'pregunta_bot', { botQuestion: true, text })
  }

  const history = await recentInbound(supabase, lead.phone)
  // Safety nets — heads-up to Nicolás; they don't change what the bot replies.
  await maybeReengagePush(supabase, lead)
  await maybeStuckPush(supabase, lead, history)

  // (0) Ad prefills / "más información" — fixed rules, no model.
  const pre = prefillKind(text)
  if (pre === 'empezar') {
    await logDecision(supabase, lead, { text, accion: 'responder', motivo: 'prefill_empezar', reply: '[quien]', model: 'regla' })
    return showQuien(supabase, lead)
  }
  if (pre === 'precio') {
    await logDecision(supabase, lead, { text, accion: 'responder', motivo: 'prefill_precio', reply: '[canned:precio]', model: 'regla' })
    return runIntents(supabase, lead, text, [{ intent: 'precio' }])
  }
  if (pre === 'info') {
    await logDecision(supabase, lead, { text, accion: 'responder', motivo: 'mas_informacion', reply: '[canned:precio+ubicacion]', model: 'regla' })
    return runIntents(supabase, lead, text, [{ intent: 'precio' }, { intent: 'ubicacion' }])
  }

  // (1) Claude classifies against the pending question + the cards on offer.
  let d = null
  try {
    d = await decideFreeText({
      history: history.slice(0, -1).slice(-8),
      step: lead.step_actual,
      pregunta: pendingQuestion(lead),
      ofrecidos: await offeredNames(supabase, lead),
      text,
    })
  } catch (e) { console.warn('[bot] brain path failed:', e.message) }

  // (2) A therapist named in the text (deterministic) is always a choice.
  const named = matchTherapistInText(await allTherapists(supabase), text)

  if (d) {
    const summary = d.intents.map((i) => (i.valor ? `${i.intent}:${i.valor}` : i.intent)).join('+')
    if (d.accion === 'derivar') {
      if (d.motivo === 'urgente') {
        const reply = d.texto || 'Gracias por escribir. En un momento te contacta una persona del equipo.'
        await txt(supabase, lead, reply, { greet: false }) // urgente copy unchanged (#55)
        await logDecision(supabase, lead, { text, accion: 'derivar', motivo: 'urgente', reply, model: d.model, latencyMs: d.latencyMs })
        return escalate(supabase, lead, 'URGENTE — urgente', { urgent: true })
      }
      await logDecision(supabase, lead, { text, accion: 'derivar', motivo: d.motivo || 'otro', reply: summary || null, model: d.model, latencyMs: d.latencyMs })
      return handoff(supabase, lead, `derivar — ${d.motivo || 'otro'}`, { botQuestion: /bot/i.test(d.motivo || ''), text })
    }
    const intents = mergeNamed(d.intents, named)
    if (!intents.length && !PROMPT_MODE[lead.step_actual]) { // nothing a CANNED answer or a step covers
      await logDecision(supabase, lead, { text, accion: 'derivar', motivo: 'sin_intent', reply: null, model: d.model, latencyMs: d.latencyMs })
      return handoff(supabase, lead, 'sin_intent')
    }
    if (d.categoria && !lead.categoria) await patchLead(supabase, lead, { categoria: d.categoria })
    await logDecision(supabase, lead, { text, accion: 'responder', motivo: summary || '(sin intents)', reply: null, model: d.model, latencyMs: d.latencyMs })
    return runIntents(supabase, lead, text, intents, { named })
  }

  // (3) Model down → keywords (+ APIMart for a bare question), else derive.
  let intents = mergeNamed(classifyKeywords(text, { step: lead.step_actual }), named)
  if (!intents.length) {
    const k = await classifyFreeText(text)
    if (k) intents = [{ intent: k }]
  }
  if (!intents.length && !['reasons', 'diagnostico_prompt', 'varios_prompt'].includes(lead.step_actual)) {
    await logDecision(supabase, lead, { text, accion: 'derivar', motivo: 'no_clasificado', reply: null, fallback: true })
    return handoff(supabase, lead, 'no_clasificado')
  }
  await logDecision(supabase, lead, { text, accion: 'responder', motivo: intents.map((i) => i.intent).join('+') || 'motivo', reply: null, fallback: true })
  return runIntents(supabase, lead, text, intents, { named })
}

function mergeNamed(intents, named) {
  if (!named || intents.some((i) => i.intent === 'elige_terapeuta')) return intents
  return [...intents.filter((i) => i.intent !== 'agendar'), { intent: 'elige_terapeuta', valor: `${named.nombre} ${named.apellido}` }].slice(-3)
}

// Act on the ordered intents. CANNED answers go out in the lead's order (one
// answer per intent); then at most ONE flow step runs (choosing a therapist >
// age > who > yes/no > motive > booking request); if no step ran, the answers'
// tail runs once (handoff / cards / one-time invitation / pending question).
// Greetings and thanks alone repeat the pending question.
const FLOW_ORDER = ['elige_terapeuta', 'edad', 'quien_hijo', 'quien_pareja', 'quien_yo', 'afirmativo', 'negativo', 'motivo', 'agendar']
const PROMPT_MODE = { reasons: 'motivo', diagnostico_prompt: 'diagnostico', varios_prompt: 'varios' }
async function runIntents(supabase, lead, text, intents, { named = null } = {}) {
  const ends = []
  for (const i of intents) {
    if (CANNED[i.intent]) ends.push(await sendBubbles(supabase, lead, i.intent))
    if (lead.bot_paused) return
  }
  const flow = FLOW_ORDER.map((k) => intents.find((i) => i.intent === k)).find(Boolean)
  const mode = PROMPT_MODE[lead.step_actual]

  // Answers that end in a handoff or Carolina's cards win over any flow step.
  if (ends.includes('handoff') || ends.includes('cards')) return finishAnswers(supabase, lead, ends)

  if (flow) {
    const done = await runFlow(supabase, lead, text, flow, intents, { named, mode })
    if (done !== false) return
  } else if (mode && !ends.length && !intents.some((i) => ['saludo', 'gracias'].includes(i.intent))) {
    // A prompt step answered with a description the classifier didn't tag.
    return matchFlow(supabase, lead, text, mode)
  }
  if (ends.length) return finishAnswers(supabase, lead, ends)
  return askPending(supabase, lead) // saludo / gracias / nothing actionable
}

// One flow step. Returns false when the intent doesn't apply at this step (the
// caller then falls back to the answers' tail or the pending question).
async function runFlow(supabase, lead, text, flow, intents, { named, mode }) {
  const step = lead.step_actual
  switch (flow.intent) {
    case 'elige_terapeuta': {
      const t = named || await resolveTherapistByName(supabase, flow.valor)
      if (t) return pickTherapist(supabase, lead, t, text)
      if (step === 'cards') return askPending(supabase, lead)
      return false
    }
    case 'edad': {
      const n = parseInt(String(flow.valor || '').match(/\d{1,2}/)?.[0] || '', 10)
      const forKid = step === 'edad' || lead.quien === 'hijo' || intents.some((i) => i.intent === 'quien_hijo')
      if (Number.isFinite(n) && forKid) return chooseEdad(supabase, lead, edadKey(n))
      if (intents.some((i) => i.intent === 'quien_hijo')) return chooseQuien(supabase, lead, 'hijo')
      return false
    }
    case 'quien_hijo': return chooseQuien(supabase, lead, 'hijo')
    case 'quien_pareja': return chooseQuien(supabase, lead, 'pareja')
    case 'quien_yo': return chooseQuien(supabase, lead, 'yo')
    case 'afirmativo': // "si" to the invitation (or to "Deseas ver sus perfiles?")
      if (!step || step === 'answered') return invitationYes(supabase, lead)
      return false
    case 'negativo':
      if (step === 'answered' && lead.invitacion_enviada) return ask(supabase, lead, 'Claro, dime', 'pregunta_abierta')
      return false
    case 'motivo':
      if (mode) return matchFlow(supabase, lead, text, mode)
      return matchFlow(supabase, lead, text, 'motivo')
    case 'agendar':
      if (inFlow(lead)) return false
      return showQuien(supabase, lead)
    default: return false
  }
}

// Legacy taps (buttons still sitting in old chats) + template quick-replies.
async function handleTap(supabase, lead, tap) {
  const id = tap.id || ''
  if (id === 'inv_si') return invitationYes(supabase, lead)
  if (id === 'inv_otra') return ask(supabase, lead, 'Claro, dime', 'pregunta_abierta')
  if (id.startsWith('quien:')) return chooseQuien(supabase, lead, id.slice(6))
  if (id.startsWith('edad:')) return chooseEdad(supabase, lead, id.slice(5))
  if (id.startsWith('cat:')) return chooseReason(supabase, lead, id.slice(4))
  if (id.startsWith('pick:')) return chooseTherapist(supabase, lead, id.slice(5))
  if (id.startsWith('horarios:')) return chooseTherapist(supabase, lead, id.slice(9))
  if (id.startsWith('vermas:')) return chooseTherapist(supabase, lead, id.slice(7))
  if (id.startsWith('slot:')) return bookSlot(supabase, lead, id.slice(5))
  // Follow-up template quick-replies (payload = the button text)
  if (id === 'Confirmo') { await txt(supabase, lead, 'Perfecto! Te esperamos.'); return }
  if (id === 'Cambiar hora' || id === 'Sí, reagendar') return rebookFromButton(supabase, lead)
  if (id === 'Sí, quiero agendar') return firstSessionInterest(supabase, lead)
  return askPending(supabase, lead)
}

// "Sí" to the one-time invitation. If a reason was already detected from the
// conversation, skip ahead to it ('hijo' → the age question); else ask who the
// therapy is for.
async function invitationYes(supabase, lead) {
  if (lead.categoria) return chooseReason(supabase, lead, lead.categoria)
  return showQuien(supabase, lead)
}

// "Cambiar hora" / "Sí, reagendar" → the booking link (no slot list).
async function rebookFromButton(supabase, lead) {
  if (!lead.therapist_id) return askPending(supabase, lead)
  return sendBookingLink(supabase, lead, lead.therapist_id)
}

async function firstSessionInterest(supabase, lead) {
  await txt(supabase, lead, 'Genial! Un momento, coordinamos tu primera sesión por aquí.')
  try {
    await tx.notifyTherapist(supabase, lead.therapist_id || null, {
      title: 'Lead quiere primera sesión 🌿',
      body: `${lead.wa_name || lead.phone} quiere agendar su primera sesión`,
      url: '/marketing',
    })
  } catch (e) { console.warn('[bot] first-session push failed:', e.message) }
}

// Entry point, called from the webhook (taps, inline) and the background function
// (free text / media). Self-gates on LEAD_BOT_LIVE + bot_paused. Never throws.
// ZERO SILENCE (#54): a turn that ends with no send and no derivation — or that
// crashes before sending — derives to Nicolás with motivo 'sin_respuesta'.
export async function runBot(supabase, { lead, isNew, msg }) {
  if (!lead || lead.bot_paused) return
  if (!botAllowedForPhone(lead.phone, lead)) return
  lead.__sent = 0
  lead.__derived = false
  let err = null
  try {
    const tap = extractTap(msg)
    if (!isNew && lead.nudges_sent > 0) await patchLead(supabase, lead, { nudges_sent: 0 })
    // Audio at ANY point → a person (spec).
    if (msg?.type === 'audio') await handoff(supabase, lead, 'audio')
    else if (tap) await handleTap(supabase, lead, tap)
    else if (msg?.type === 'text' && msg.text?.body) {
      await handleFreeText(supabase, lead, msg.text.body, { firstTouch: isNew || !lead.step_actual })
    } else {
      // Any other inbound (sticker/reaction/etc) → the pending question.
      await askPending(supabase, lead)
    }
  } catch (e) {
    err = e
    console.warn('[bot] runBot failed (non-blocking):', e.message)
  }
  if (!lead.__sent && !lead.__derived && !lead.bot_paused) {
    const text = msg?.text?.body || extractTap(msg)?.title || `[${msg?.type || 'desconocido'}]`
    console.warn(`[bot] lead ${lead.id} turn ended silent${err ? ` (error: ${err.message})` : ''} → derive sin_respuesta`)
    await logDecision(supabase, lead, { text, accion: 'derivar', motivo: 'sin_respuesta', reply: err ? `error: ${err.message}` : null, model: 'guardia' })
    try { await handoff(supabase, lead, 'sin_respuesta') } catch (e) { console.warn('[bot] sin_respuesta handoff failed:', e.message) }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase C — follow-ups (lead-followups cron + the therapist Se hizo/No contestó
// reply). All best-effort; none throw.
// ─────────────────────────────────────────────────────────────────────────────

const leadFirstName = (lead) => String(lead?.wa_name || '').trim().split(/\s+/)[0] || ''
async function therapistShort(supabase, therapistId) {
  if (!therapistId) return 'tu terapeuta'
  const { data: t } = await supabase.from('therapists').select('nombre').eq('id', therapistId).maybeSingle()
  return t ? shortName(t.nombre) : 'tu terapeuta'
}

// Silent mid-flow nudge (#37): ONE nudge only, at +22h; after it → stage=frio.
export const NUDGE_TEXT = 'Empezar terapia es una decisión importante. Aquí estamos cuando sea el momento. Att: Nico'
export async function nudgeLead(supabase, lead) {
  if (lead.bot_paused) return 'skipped'
  const n = (lead.nudges_sent || 0) + 1
  try {
    await sendText(lead.phone, NUDGE_TEXT)
  } catch (e) { console.error('[followups] nudge failed:', e.message); return 'failed' }
  const patch = { nudges_sent: n, last_bot_at: new Date().toISOString() }
  if (n >= 1) { patch.stage = 'frio'; if (!lead.frio_at) patch.frio_at = new Date().toISOString() }
  await patchLead(supabase, lead, patch)
  return 'sent'
}

// Call reminder (recordatorio_llamada) — to the LEAD ~1h before the call.
export async function sendReminderForLead(supabase, lead, therapist, hora) {
  if (lead.bot_paused) return 'skipped'
  const toE164 = normalizePhone(lead.phone)
  if (!toE164) return 'skipped'
  try {
    await sendCallReminder(toE164, { name: leadFirstName(lead), therapist: shortName(therapist.nombre), hora })
    await patchLead(supabase, lead, { recordatorio_llamada_at: new Date().toISOString() })
    return 'sent'
  } catch (e) { console.error('[followups] call reminder failed:', e.message); return 'failed' }
}

// Therapist result (resultado_llamada) — to the THERAPIST ~5 min after the call ends.
export async function sendResultForLead(supabase, lead, therapist, hora) {
  const toE164 = normalizePhone(therapist.telefono)
  if (!toE164) { console.warn(`[followups] therapist ${therapist.id} has no phone`); return 'skipped' }
  try {
    const wamid = await sendCallResult(toE164, { therapist: shortName(therapist.nombre), name: leadFirstName(lead), hora })
    await patchLead(supabase, lead, { resultado_llamada_at: new Date().toISOString(), resultado_llamada_wamid: wamid })
    return 'sent'
  } catch (e) { console.error('[followups] result failed:', e.message); return 'failed' }
}

// 48h first-session nudge (primera_sesion) — to the LEAD.
export async function sendFirstSessionForLead(supabase, lead, therapist) {
  if (lead.bot_paused) return 'skipped'
  const toE164 = normalizePhone(lead.phone)
  if (!toE164) return 'skipped'
  try {
    await sendFirstSessionNudge(toE164, { name: leadFirstName(lead), therapist: shortName(therapist.nombre) })
    await patchLead(supabase, lead, { nudge48_sent_at: new Date().toISOString() })
    return 'sent'
  } catch (e) { console.error('[followups] 48h nudge failed:', e.message); return 'failed' }
}

// The therapist tapped Se hizo / No contestó on a resultado_llamada template.
export async function handleTherapistResult(supabase, msg) {
  const tap = extractTap(msg)
  const id = tap?.id
  if (id !== 'Se hizo' && id !== 'No contestó') return false

  let lead = null
  const ctxId = msg?.context?.id
  if (ctxId) {
    const { data } = await supabase.from('leads').select('*').eq('resultado_llamada_wamid', ctxId).maybeSingle()
    lead = data || null
  }
  if (!lead) {
    const fromNorm = normalizePhone(msg.from); const f9 = last9(msg.from)
    const { data: ths } = await supabase.from('therapists').select('id, telefono')
    const th = (ths || []).find((t) => {
      const n = normalizePhone(t.telefono)
      return (fromNorm && n === fromNorm) || (f9 && last9(t.telefono) === f9)
    })
    if (th) {
      const { data } = await supabase.from('leads').select('*')
        .eq('therapist_id', th.id).not('resultado_llamada_at', 'is', null)
        .is('llamada_hecha_at', null).is('no_contesto_at', null)
        .order('resultado_llamada_at', { ascending: false }).limit(1)
      lead = data?.[0] || null
    }
  }
  if (!lead) { console.warn('[bot] therapist result: no matching lead'); return true }

  if (id === 'Se hizo') {
    await advanceStage(supabase, lead, 'llamada_hecha')
    console.log(`[bot] lead ${lead.id} → llamada_hecha`)
    return true
  }
  await advanceStage(supabase, lead, 'no_contesto')
  if (!lead.rebook_sent_at && !lead.bot_paused && botAllowedForPhone(lead.phone, lead)) {
    try {
      await sendRebook(lead.phone, { name: leadFirstName(lead), therapist: await therapistShort(supabase, lead.therapist_id) })
      await patchLead(supabase, lead, { rebook_sent_at: new Date().toISOString() })
      console.log(`[bot] lead ${lead.id} rebook sent`)
    } catch (e) { console.warn('[bot] rebook send failed:', e.message) }
  }
  return true
}
