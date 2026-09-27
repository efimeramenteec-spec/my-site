// netlify/lib/leadBot.mjs
//
// Lead-funnel brain — funnel v2 (#27), "answer first, then offer".
//
// Phase A = measurement: classify an inbound sender, create the `leads` row on
// first contact, honour the manual-reply pause (smb_message_echoes). Phase B is
// the conversation: Claude (leadBrain) answers real questions FIRST; the bot then
// offers to show therapists ONCE; a reason list → gendered therapist cards → a
// call explanation → live slots → booking. Phase C = the time-based follow-ups.
// Everything the bot SENDS is gated by LEAD_BOT_LIVE (or the test allow-list);
// recording leads is measurement and always runs.
//
// v2 opening (Message 1 with price + "Elegir terapeuta" is GONE):
//   • bare greeting / ad text → welcome + reason list.
//   • a real question        → Claude answers, then the one-time invitation
//                              "*Te gustaría ver a nuestros terapeutas?*".
// Free text is delayed 20 s with a typing indicator (in the webhook + a background
// function); button taps are immediate.

import { normalizePhone } from './whatsapp.mjs'
import { sendText, sendButtons, sendList, sendImageCard } from './waSend.mjs'
import { nextSlots, createBooking } from './booking.mjs'
import { notifyTherapist } from './push.mjs'
import { sendCallReminder, sendCallResult, sendRebook, sendFirstSessionNudge } from './leadTemplates.mjs'
import { buildFactSheet, decideFreeText, matchTherapistsForText } from './leadBrain.mjs'

const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)

const FRANCISCO_ID = '2f5bf11b-42a8-562f-99c9-501c62a4ca04'
const APP_BASE = process.env.URL || 'https://efimeramente-panel.netlify.app'

// The bot may SEND to a lead when it's globally live OR when that lead's phone is
// in the test allow-list (LEAD_BOT_TEST_PHONES, comma-separated, last-9 match).
export function botAllowedForPhone(phone) {
  if (process.env.LEAD_BOT_LIVE === 'true') return true
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

// Click-to-WhatsApp ad referral → attribution fields.
export function referralOf(msg) {
  const r = msg?.referral
  if (!r) return { source: 'whatsapp_organico', ad_source_id: null, ad_headline: null }
  return { source: 'meta_ctwa', ad_source_id: r.source_id || null, ad_headline: r.headline || null }
}

// A first-contact ORGANIC sender (no ad referral) who already has an inbound
// message on record is a known contact, NOT a lead. Ad clicks always create a row.
async function hasEarlierInbound(supabase, from) {
  const { data } = await supabase.from('whatsapp_messages')
    .select('id').eq('direccion', 'inbound')
    .eq('raw_payload->message->>from', String(from || '')).limit(1)
  return !!(data && data.length)
}

// Create the lead row on first contact, or return the existing one. Measurement
// only — sends nothing. Returns { lead, isNew } or null.
export async function recordLead(supabase, { msg, contact }) {
  const phone = normalizePhone(msg.from)
  if (!phone) return null

  const { data: existing } = await supabase.from('leads').select('*').eq('phone', phone).maybeSingle()
  if (existing) {
    const waName = contact?.profile?.name
    if (waName && !existing.wa_name) {
      await supabase.from('leads').update({ wa_name: waName, updated_at: new Date().toISOString() }).eq('id', existing.id)
      existing.wa_name = waName
    }
    return { lead: existing, isNew: false }
  }

  const { source, ad_source_id, ad_headline } = referralOf(msg)
  if (source === 'whatsapp_organico' && await hasEarlierInbound(supabase, msg.from)) {
    console.log(`[lead] skip — organic known contact phone=${phone}`)
    return null
  }
  const row = { phone, wa_name: contact?.profile?.name || null, source, ad_source_id, ad_headline, stage: 'nuevo' }
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

// smb_message_echoes: a manual send from the business number → hard pause for that
// lead forever. Also the litmus test that Dualhook forwards echoes at all.
export async function handleEchoes(supabase, value) {
  const echoes = value?.message_echoes
  if (!Array.isArray(echoes) || echoes.length === 0) return 0
  let paused = 0
  for (const e of echoes) {
    const to = normalizePhone(e.to)
    console.log(`[wa-cloud] SMB ECHO forwarded by Dualhook — to=${e.to} type=${e.type}`)
    if (!to) continue
    const { data: lead } = await supabase.from('leads').select('id, bot_paused').eq('phone', to).maybeSingle()
    if (lead && !lead.bot_paused) {
      await supabase.from('leads').update({ bot_paused: true, updated_at: new Date().toISOString() }).eq('id', lead.id)
      paused++
      console.log(`[lead] ${lead.id} bot_paused — manual reply detected`)
    }
  }
  return paused
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase B — the conversation. Runs only when botAllowedForPhone && !bot_paused.
// All sends are best-effort; a send failure never crashes the webhook's 200.
// ─────────────────────────────────────────────────────────────────────────────

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const DIAS_FULL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_FULL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function humanSlot(date, time) {
  const d = new Date(`${date}T00:00:00Z`)
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES_ABBR[d.getUTCMonth()]} · ${time}`
}
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
function ecHourNow() { return (new Date().getUTCHours() + 24 - 5) % 24 }
function isNightGYE() { const h = ecHourNow(); return h >= 23 || h < 7 }

// Persist a patch and mirror it onto the in-memory lead.
async function patchLead(supabase, lead, patch) {
  patch.updated_at = new Date().toISOString()
  await supabase.from('leads').update(patch).eq('id', lead.id)
  Object.assign(lead, patch)
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

// Pull the tap (button/list reply) out of an inbound message, else null (= free text).
function extractTap(msg) {
  if (msg?.type === 'interactive') {
    const i = msg.interactive
    if (i?.button_reply?.id) return { id: i.button_reply.id, title: i.button_reply.title }
    if (i?.list_reply?.id) return { id: i.list_reply.id, title: i.list_reply.title }
  }
  if (msg?.type === 'button' && msg.button?.payload) return { id: msg.button.payload, title: msg.button.text }
  return null
}
// The webhook uses this to decide immediate (tap) vs 20s-delayed (text) handling.
export function isTap(msg) { return !!extractTap(msg) }

// ── The one-time invitation ("answer first, then offer") ─────────────────────
const INVITATION = '*Te gustaría ver a nuestros terapeutas disponibles?*'
const INVITATION_BUTTONS = [
  { id: 'inv_si', title: 'Sí' },
  { id: 'inv_otra', title: 'Tengo otra pregunta' },
]
// Offer to show therapists — but only ONCE per lead (spec). No-op if already sent.
async function sendInvitationOnce(supabase, lead) {
  if (lead.invitacion_enviada) return
  await sendButtons(lead.phone, INVITATION, INVITATION_BUTTONS)
  await patchLead(supabase, lead, { invitacion_enviada: true })
}

// ── Canned fallback copy (used only when the model is unavailable) ────────────
const MAPS_LINK = 'https://maps.app.goo.gl/GZAFUpC1SAyW8GBT8'
const ANSWER_COPY = {
  precio: 'La sesión cuesta $39, o $35 c/u en paquete de 4.\n💳 Aceptamos tarjeta\n🧾 Muchos seguros privados reembolsan la terapia — te ayudamos con el trámite.',
  ubicacion: '📍 Estamos en Cumbayá, a 3 minutos del Scala, con parqueadero privado y seguro.\n💻 También atendemos online.',
  seguro: 'Muchos seguros privados reembolsan terapia psicológica según tu plan (Bupa y Humana, por ejemplo, hasta el 80%). Te damos la factura con el formato que piden y te ayudamos con el trámite.',
  pago: '💳 Puedes pagar por transferencia o con tarjeta de crédito/débito (Payphone).\n📦 También hay un paquete de 4 sesiones por $140 ($35 c/u).',
}
const CONTENT = new Set(['precio', 'ubicacion', 'seguro', 'pago'])

// Plain canned answer (fallback path). Ubicación sends the Maps link first so its
// rich preview renders.
async function sendAnswerText(to, intent) {
  if (intent === 'ubicacion') {
    await sendText(to, MAPS_LINK, { previewUrl: true })
    await sendText(to, ANSWER_COPY.ubicacion)
    return
  }
  await sendText(to, ANSWER_COPY[intent] || ANSWER_COPY.precio)
}

// ── Keyword classification (deterministic, free) — greeting/thanks fast paths ─
// + the fallback intent when the model is unavailable. "domicilio" is deliberately
// NOT a location keyword — home visits aren't offered, so they fall through to a
// human handoff.
function classifyKeywords(text) {
  const t = ` ${String(text || '').toLowerCase()} `
  const has = (re) => re.test(t)
  if (has(/cu[aá]nto|cuesta|costo|valor|precio|tarifa|evaluaci[oó]n/)) return 'precio'
  if (has(/d[oó]nde|ubica|direcci[oó]n|queda|presencial|online|virtual|parqueadero/)) return 'ubicacion'
  if (has(/seguro|aseguradora|reembolso|cobertura/)) return 'seguro'
  if (has(/tarjeta|transferencia|pagar|paquete/)) return 'pago'
  if (has(/gracias|\bok\b|perfecto/)) return 'gracias'
  if (has(/hola|buenas|buenos d[ií]as|buenas tardes|buenas noches/)) return 'saludo'
  return null
}

// LLM fallback classifier (APIMart) — used only when the Anthropic brain is down.
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
    return m[0].startsWith('ubicaci') ? 'ubicacion' : m[0]
  } catch (e) { console.error('[bot] classify failed:', e.message); return null }
}

// ── Escalate + handoff ───────────────────────────────────────────────────────
// escalate: push to Nicolás + pause the bot for this lead forever.
async function escalate(supabase, lead, reason, { urgent = false } = {}) {
  await patchLead(supabase, lead, { bot_paused: true })
  try {
    await notifyTherapist(supabase, lead.therapist_id || null, {
      title: urgent ? '🚨 URGENTE — lead necesita atención' : 'Lead necesita atención 🌿',
      body: `${lead.wa_name || lead.phone} — ${reason}`,
      url: '/marketing',
    })
  } catch (e) { console.warn('[bot] escalate push failed:', e.message) }
  console.log(`[bot] lead ${lead.id} escalated (${reason})${urgent ? ' URGENTE' : ''} + paused`)
}

// Non-urgent handoff to a human. Window rule (#27): 07:00–23:00 GYE → NO bot text
// (Nicolás picks it up), just push + pause. 23:00–07:00 → one line, then pause.
// botQuestion picks the "¿bot o persona?" night variant.
async function handoff(supabase, lead, reason, { botQuestion = false } = {}) {
  if (isNightGYE()) {
    const line = botQuestion
      ? 'Soy un sistema de respuestas inteligente. Nicolás, nuestro administrador, te escribirá personalmente a primera hora de la mañana.'
      : 'Gracias por contarnos. Nicolás te escribirá personalmente a primera hora.'
    await sendText(lead.phone, line)
  }
  await escalate(supabase, lead, reason)
}

// Append a T2 decision to the audit log (Marketing → Embudo). Best-effort.
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
    })
  } catch (e) { console.warn('[bot] logDecision failed:', e.message) }
}

// ── Reason list (10 rows) ─────────────────────────────────────────────────────
async function showReasonList(supabase, lead, { body = 'Me dirías tu motivo de consulta?' } = {}) {
  await advanceStage(supabase, lead, 'toco')
  const { data: cats } = await supabase.from('funnel_categorias')
    .select('clave, etiqueta, descripcion, orden').eq('activo', true).order('orden')
  const rows = (cats || []).map((c) => ({
    id: `cat:${c.clave}`, title: c.etiqueta, ...(c.descripcion ? { description: c.descripcion } : {}),
  }))
  await sendList(lead.phone, body, 'Ver motivos', rows, { sectionTitle: 'Motivos' })
  await patchLead(supabase, lead, { step_actual: 'reasons', last_bot_at: new Date().toISOString(), parse_misses: 0 })
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

// Render the resolved therapist cards. Gendered caption line + button.
async function renderCards(supabase, lead, therapists) {
  if (!therapists.length) {
    await sendText(lead.phone, 'En este momento no tengo terapeutas disponibles para ese tema. Escríbenos y te ayudamos directamente 🌿')
    return escalate(supabase, lead, 'sin_terapeutas')
  }
  await sendText(lead.phone, 'Aquí tienes a los profesionales especializados en tu motivo de consulta.')
  for (const t of therapists) {
    const g = t.genero === 'M'
    const line = g ? '*Puedes agendar una llamada gratuita para conocerlo*' : '*Puedes agendar una llamada gratuita para conocerla*'
    const caption = captionSansEnfoque(t.funnel_caption) || `${t.nombre} ${t.apellido}`
    await sendImageCard(lead.phone, {
      imageLink: t.funnel_card_url || null,
      headerText: `${t.nombre} ${t.apellido}`,
      body: `${caption}\n\n${line}`,
      button: { id: `pick:${t.id}`, title: g ? 'Quiero conocerlo' : 'Quiero conocerla' },
    })
  }
  await patchLead(supabase, lead, { step_actual: 'cards', last_bot_at: new Date().toISOString(), parse_misses: 0 })
}

async function showCards(supabase, lead, clave) {
  const cards = await resolveCards(supabase, clave)
  return renderCards(supabase, lead, cards)
}

// A reason was chosen (tap or detected). Special reasons branch off; the rest show cards.
async function chooseReason(supabase, lead, clave) {
  const { data: cat } = await supabase.from('funnel_categorias').select('*').eq('clave', clave).eq('activo', true).maybeSingle()
  if (!cat) return showReasonList(supabase, lead)
  await advanceStage(supabase, lead, 'toco')
  await patchLead(supabase, lead, { categoria: clave })
  if (cat.especial === 'otro') return handoff(supabase, lead, 'motivo_otro')
  if (cat.especial === 'diagnostico') {
    await sendText(lead.phone, 'Cuéntame qué diagnóstico tienes o sospechas. Puedes escribirlo o mandar un audio.')
    return patchLead(supabase, lead, { step_actual: 'diagnostico_prompt', last_bot_at: new Date().toISOString(), parse_misses: 0 })
  }
  if (cat.especial === 'varios') {
    await sendText(lead.phone, 'Por favor cuéntame qué te trajo a terapia? Siéntete libre de enviar un audio si te resulta mejor.')
    return patchLead(supabase, lead, { step_actual: 'varios_prompt', last_bot_at: new Date().toISOString(), parse_misses: 0 })
  }
  return showCards(supabase, lead, clave)
}

// Reasons 7/9: Claude matches the free-text description to the roster → cards, or
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
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/\s+/)[0]
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

// ── Slots + booking ───────────────────────────────────────────────────────────
async function showSlots(supabase, lead, t) {
  const short = shortName(t.nombre)
  const slots = await nextSlots(supabase, t, 'llamada', 3)
  if (!slots.length) {
    await sendText(lead.phone, `Por ahora ${short} no tiene horarios abiertos. Puedes revisar más opciones aquí:\n${freeCallLink(t.id)}`)
    return patchLead(supabase, lead, { step_actual: 'slots', last_bot_at: new Date().toISOString(), parse_misses: 0 })
  }
  const rows = slots.map((s) => ({ id: `slot:${t.id}|${s.date}|${s.time}`, title: humanSlot(s.date, s.time) }))
  rows.push({ id: `vermas:${t.id}`, title: 'Ver más horarios' })
  await sendList(lead.phone,
    `Estos son los horarios más cercanos con ${short} para tu llamada gratuita de 10 minutos:`,
    'Ver horarios', rows, { sectionTitle: 'Horarios' })
  await patchLead(supabase, lead, { step_actual: 'slots', last_bot_at: new Date().toISOString(), parse_misses: 0 })
}

async function showSlotsById(supabase, lead, therapistId) {
  const { data: t } = await supabase.from('therapists')
    .select('id, nombre, apellido, booking_availability, calendar_email, activo').eq('id', therapistId).maybeSingle()
  if (!t || !t.activo) return renderStep(supabase, lead)
  return showSlots(supabase, lead, t)
}

// A therapist card was chosen (the interest signal). Send the call explanation
// (gendered, + the kids line for reason "hijo") and a [Ver horarios] button.
async function chooseTherapist(supabase, lead, therapistId) {
  const { data: t } = await supabase.from('therapists')
    .select('id, nombre, apellido, genero, activo').eq('id', therapistId).maybeSingle()
  if (!t || !t.activo) {
    await sendText(lead.phone, 'Esa opción ya no está disponible. Elige otra, por favor 🙂')
    return renderStep(supabase, lead)
  }
  await advanceStage(supabase, lead, 'eligio_terapeuta')
  await patchLead(supabase, lead, { therapist_id: therapistId })
  const g = t.genero === 'M'
  const nombre = shortName(t.nombre)
  const firstBullet = g
    ? '🤝 Conocerlo y ver si te sientes bien con él'
    : '🤝 Conocerla y ver si te sientes bien con ella'
  let body = `Genial. La llamada gratuita con ${nombre} te sirve para:
${firstBullet}
💬 Contarle sobre tu caso
🎯 Preguntarle cómo trabaja y qué resultados buscar con la terapia
✨ Lo que tú quieras: es una conversación entre ustedes dos
No tiene ningún compromiso, es para ayudarte a decidir. Si quieres conocer a más de un terapeuta, puedes agendar varias llamadas.`
  if (lead.categoria === 'hijo') {
    body += '\n\nSi la terapia es para tu hijo/a, puedes agendar 2 llamadas: una para que la conozcas tú y otra para tu hijo/a.'
  }
  await sendButtons(lead.phone, body, [{ id: `horarios:${t.id}`, title: 'Ver horarios' }])
  await patchLead(supabase, lead, { step_actual: 'explicacion', last_bot_at: new Date().toISOString(), parse_misses: 0 })
}

async function bookSlot(supabase, lead, rest) {
  const [therapistId, date, time] = String(rest).split('|')
  const { data: t } = await supabase.from('therapists')
    .select('id, nombre, apellido, booking_availability, calendar_email').eq('id', therapistId).maybeSingle()
  if (!t) { await sendText(lead.phone, 'Ese horario ya no está disponible.'); return renderStep(supabase, lead) }

  const name = String(lead.wa_name || '').trim()
  const [nombre, ...apParts] = name.split(/\s+/)
  const result = await createBooking(supabase, {
    therapist: t, date, startTime: time, kindKey: 'llamada', modalidad: 'en_linea',
    patient: { nombre: nombre || 'Lead', apellido: apParts.join(' '), telefono: lead.phone },
    esLead: true, fuente: lead.source,
  })
  if (!result.ok) {
    if (result.error === 'slot_taken') {
      await sendText(lead.phone, '¡Uy! Ese horario se acaba de ocupar. Aquí tienes horarios frescos 👇')
      return showSlots(supabase, lead, t)
    }
    await sendText(lead.phone, 'No pude agendar en este momento. Escríbenos y te ayudamos 🌿')
    return escalate(supabase, lead, `booking_${result.error}`)
  }
  await advanceStage(supabase, lead, 'agendo')
  await patchLead(supabase, lead, {
    session_id: result.sessionId, patient_id: result.patientId,
    step_actual: 'agendado', last_bot_at: new Date().toISOString(), parse_misses: 0,
  })
  await sendText(lead.phone,
    `✅ ¡Listo! Tu llamada gratuita con ${shortName(t.nombre)} es el ${humanDateLong(date, time)}.
Te llamará a este número. 📞
Si necesitas cambiarla, escríbenos por aquí.`)
}

async function sendMoreLink(supabase, lead, therapistId) {
  await sendText(lead.phone, `Puedes ver todos los horarios disponibles aquí:\n${freeCallLink(therapistId)}`)
  await patchLead(supabase, lead, { last_bot_at: new Date().toISOString() })
}

// Re-render the current interactive step (after a stray tap / non-text media).
async function renderStep(supabase, lead, { note } = {}) {
  if (note) await sendText(lead.phone, note)
  const step = lead.step_actual
  if (step === 'reasons') return showReasonList(supabase, lead)
  if (step === 'cards' && lead.categoria) return showCards(supabase, lead, lead.categoria)
  if (step === 'slots' && lead.therapist_id) return showSlotsById(supabase, lead, lead.therapist_id)
  if (!note) await sendText(lead.phone, 'Cuéntame, en qué te ayudo 🙂')
}

// Recent inbound lines from this chat (oldest first), for the T2 model context.
async function recentInbound(supabase, phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return []
  const { data } = await supabase.from('whatsapp_messages')
    .select('cuerpo, created_at').eq('direccion', 'inbound')
    .eq('raw_payload->message->>from', digits)
    .order('created_at', { ascending: false }).limit(12)
  return (data || [])
    .map((r) => (r.cuerpo || '').trim())
    .filter((c) => c && !c.startsWith('['))
    .reverse()
}

// The chosen therapist's next real free slots (human strings), so the model can
// speak truthfully about availability.
async function slotsForLead(supabase, lead) {
  if (!lead.therapist_id) return []
  const { data: t } = await supabase.from('therapists')
    .select('id, nombre, apellido, booking_availability, calendar_email').eq('id', lead.therapist_id).maybeSingle()
  if (!t) return []
  try {
    const s = await nextSlots(supabase, t, 'llamada', 3)
    return s.map((x) => humanSlot(x.date, x.time))
  } catch { return [] }
}

// Welcome + reason list (bare greeting / ad text on first contact).
async function welcomeAndReasons(supabase, lead) {
  await sendText(lead.phone, 'Hola! Qué gusto que nos escribas')
  return showReasonList(supabase, lead)
}

// A BARE greeting is just "hola" / "buenas" with nothing substantive. A greeting
// that carries a motive ("hola, es para mi hijo de 15") is NOT bare — it goes to
// Claude so the reason gets detected. Strip greeting words + punctuation and check
// what's left.
function isBareGreeting(text) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const stripped = t
    .replace(/buen[oa]s?\s*(d[ií]as|tardes|noches)?/g, '')
    .replace(/hola|holaa+|ola|hey|hi|saludos|que tal|klk|buenas/g, '')
    .replace(/[^a-z0-9]/g, '')
  return stripped.length < 4
}

// T2 — free text. Greetings/thanks short-circuit; the diagnóstico/varios prompt
// steps go to the matcher; everything else asks Claude, who answers from the fact
// sheet or derives. Keyword canned answers are the fallback if the model is down.
async function handleFreeText(supabase, lead, text, { firstTouch = false } = {}) {
  const kw = classifyKeywords(text)
  if (kw === 'gracias') { await sendText(lead.phone, 'Con gusto! 🌿'); return }
  // A BARE greeting on first contact → welcome + reasons. A greeting carrying a
  // motive ("hola, es para mi hijo de 15") is NOT bare — let Claude answer + detect
  // the reason, so a later "Sí" can skip the list.
  if (kw === 'saludo' && isBareGreeting(text)) {
    if (firstTouch) return welcomeAndReasons(supabase, lead)
    await sendText(lead.phone, 'Hola! 🌿 Cuéntame, en qué te puedo ayudar')
    return
  }
  if (lead.step_actual === 'diagnostico_prompt') return matchFlow(supabase, lead, text, 'diagnostico')
  if (lead.step_actual === 'varios_prompt') return matchFlow(supabase, lead, text, 'varios')

  let decision = null
  try {
    const [factSheet, history, slots] = await Promise.all([
      buildFactSheet(supabase),
      recentInbound(supabase, lead.phone),
      slotsForLead(supabase, lead),
    ])
    decision = await decideFreeText({ factSheet, history, step: lead.step_actual, slots, text })
  } catch (e) { console.warn('[bot] brain path failed:', e.message) }

  if (decision) return applyDecision(supabase, lead, text, decision)
  return keywordFallback(supabase, lead, text, kw)
}

// Act on Claude's {accion, texto, motivo, categoria}. "responder" → send the answer
// (alone), remember a detected categoria, and offer the invitation once. "derivar"
// → urgent = containment (+911 on life risk) always sent; otherwise day/night handoff.
async function applyDecision(supabase, lead, text, d) {
  if (d.accion === 'responder') {
    const reply = d.texto || ANSWER_COPY.precio
    await sendText(lead.phone, reply)
    if (d.categoria) await patchLead(supabase, lead, { categoria: d.categoria })
    await patchLead(supabase, lead, { step_actual: 'answered', parse_misses: 0, last_bot_at: new Date().toISOString() })
    await sendInvitationOnce(supabase, lead)
    await logDecision(supabase, lead, { text, accion: d.accion, motivo: d.motivo, reply, model: d.model, latencyMs: d.latencyMs })
    return
  }
  // derivar
  if (d.motivo === 'urgente') {
    const reply = d.texto || 'Gracias por escribir 🌿 En un momento te contacta una persona del equipo.'
    await sendText(lead.phone, reply)
    await logDecision(supabase, lead, { text, accion: d.accion, motivo: d.motivo, reply, model: d.model, latencyMs: d.latencyMs })
    return escalate(supabase, lead, `URGENTE — ${d.motivo}`, { urgent: true })
  }
  await logDecision(supabase, lead, { text, accion: d.accion, motivo: d.motivo, reply: null, model: d.model, latencyMs: d.latencyMs })
  return handoff(supabase, lead, `derivar — ${d.motivo || 'otro'}`, { botQuestion: /bot/i.test(d.motivo || '') })
}

// Fallback when the model is unavailable: keyword canned answers + invitation, else handoff.
async function keywordFallback(supabase, lead, text, kw) {
  const intent = kw || await classifyFreeText(text)
  if (CONTENT.has(intent)) {
    await sendAnswerText(lead.phone, intent)
    await patchLead(supabase, lead, { step_actual: 'answered', parse_misses: 0, last_bot_at: new Date().toISOString() })
    await sendInvitationOnce(supabase, lead)
    await logDecision(supabase, lead, { text, accion: 'responder', motivo: intent, reply: ANSWER_COPY[intent], fallback: true })
    return
  }
  const motivo = intent === 'otro' ? 'clasificado_otro' : 'no_clasificado'
  await logDecision(supabase, lead, { text, accion: 'derivar', motivo, reply: null, fallback: true })
  return handoff(supabase, lead, motivo)
}

async function handleTap(supabase, lead, tap) {
  const id = tap.id || ''
  if (id === 'inv_si') return invitationYes(supabase, lead)
  if (id === 'inv_otra') { await sendText(lead.phone, 'Claro, dime'); return patchLead(supabase, lead, { step_actual: 'pregunta_abierta', last_bot_at: new Date().toISOString() }) }
  if (id.startsWith('cat:')) return chooseReason(supabase, lead, id.slice(4))
  if (id.startsWith('pick:')) return chooseTherapist(supabase, lead, id.slice(5))
  if (id.startsWith('horarios:')) return showSlotsById(supabase, lead, id.slice(9))
  if (id.startsWith('slot:')) return bookSlot(supabase, lead, id.slice(5))
  if (id.startsWith('vermas:')) return sendMoreLink(supabase, lead, id.slice(7))
  // Follow-up template quick-replies (payload = the button text)
  if (id === 'Confirmo') { await sendText(lead.phone, '¡Perfecto! Te esperamos 🌿'); return }
  if (id === 'Cambiar hora' || id === 'Sí, reagendar') return rebookFromButton(supabase, lead)
  if (id === 'Sí, quiero agendar') return firstSessionInterest(supabase, lead)
  return renderStep(supabase, lead)
}

// The lead tapped "Sí" on the one-time invitation. If a reason was already detected
// from the conversation, skip the list and go straight to it; else show the list.
async function invitationYes(supabase, lead) {
  if (lead.categoria) return chooseReason(supabase, lead, lead.categoria)
  return showReasonList(supabase, lead)
}

async function rebookFromButton(supabase, lead) {
  if (!lead.therapist_id) return renderStep(supabase, lead)
  await sendText(lead.phone, '¡Claro! Estos son los horarios disponibles 👇')
  return showSlotsById(supabase, lead, lead.therapist_id)
}

async function firstSessionInterest(supabase, lead) {
  await sendText(lead.phone, '¡Genial! 🌿 Un momento, coordinamos tu primera sesión por aquí.')
  try {
    await notifyTherapist(supabase, lead.therapist_id || null, {
      title: 'Lead quiere primera sesión 🌿',
      body: `${lead.wa_name || lead.phone} quiere agendar su primera sesión`,
      url: '/marketing',
    })
  } catch (e) { console.warn('[bot] first-session push failed:', e.message) }
}

// Entry point, called from the webhook (taps, inline) and the delayed background
// function (free text / media). Self-gates on LEAD_BOT_LIVE + bot_paused. Never throws.
export async function runBot(supabase, { lead, isNew, msg }) {
  if (!lead || lead.bot_paused) return
  if (!botAllowedForPhone(lead.phone)) return
  try {
    const tap = extractTap(msg)
    if (!isNew && lead.nudges_sent > 0) await patchLead(supabase, lead, { nudges_sent: 0 })
    // Audio at ANY point → a person (spec).
    if (msg?.type === 'audio') return await handoff(supabase, lead, 'audio')
    if (tap) return await handleTap(supabase, lead, tap)
    if (msg?.type === 'text' && msg.text?.body) {
      const firstTouch = isNew || !lead.step_actual
      return await handleFreeText(supabase, lead, msg.text.body, { firstTouch })
    }
    // Any other inbound (image/sticker/etc) → gentle nudge back to the current step.
    return await renderStep(supabase, lead, { note: 'Cuéntame, en qué te ayudo 🙂' })
  } catch (e) {
    console.warn('[bot] runBot failed (non-blocking):', e.message)
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

// Silent mid-flow nudge. 1st at +2h, 2nd at +22h; after the 2nd → stage=frio.
// Neutral copy (#27): no call push, just "we're still here".
export async function nudgeLead(supabase, lead) {
  if (lead.bot_paused) return 'skipped'
  const n = (lead.nudges_sent || 0) + 1
  try {
    await sendText(lead.phone, 'Seguimos aquí si tienes alguna otra pregunta')
  } catch (e) { console.error('[followups] nudge failed:', e.message); return 'failed' }
  const patch = { nudges_sent: n, last_bot_at: new Date().toISOString() }
  if (n >= 2) { patch.stage = 'frio'; if (!lead.frio_at) patch.frio_at = new Date().toISOString() }
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
  if (!lead.rebook_sent_at && !lead.bot_paused && botAllowedForPhone(lead.phone)) {
    try {
      await sendRebook(lead.phone, { name: leadFirstName(lead), therapist: await therapistShort(supabase, lead.therapist_id) })
      await patchLead(supabase, lead, { rebook_sent_at: new Date().toISOString() })
      console.log(`[bot] lead ${lead.id} rebook sent`)
    } catch (e) { console.warn('[bot] rebook send failed:', e.message) }
  }
  return true
}
