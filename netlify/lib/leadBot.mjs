// netlify/lib/leadBot.mjs
//
// Lead-funnel brain (#4 + #20). Phase A = measurement: classify an inbound
// sender, create the `leads` row on first contact, and honour the manual-reply
// pause signal (smb_message_echoes). Phase B layers the button bot on top of
// these helpers; Phase C the follow-ups. Everything the bot SENDS is gated by
// LEAD_BOT_LIVE — but recording leads is measurement and always runs, so the
// funnel numbers start filling the moment this deploys, before the bot is live.
//
// A lead is any phone that messages the central number and is NOT already a
// patient, therapist or payer. Matching is the same fuzzy phone match used by the
// reminder loop (normalized E.164 OR last-9-digits) so number formatting can't
// misclassify a known contact as a lead.

import { normalizePhone } from './whatsapp.mjs'
import { sendText, sendButtons, sendList, sendImageCard } from './waSend.mjs'
import { nextSlots, createBooking } from './booking.mjs'
import { notifyTherapist } from './push.mjs'
import { sendCallReminder, sendCallResult, sendRebook, sendFirstSessionNudge } from './leadTemplates.mjs'
import { buildFactSheet, decideFreeText } from './leadBrain.mjs'

const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)

const FRANCISCO_ID = '2f5bf11b-42a8-562f-99c9-501c62a4ca04'
const APP_BASE = process.env.URL || 'https://efimeramente-panel.netlify.app'

// The bot may SEND to a lead when it's globally live OR when that lead's phone is
// in the test allow-list (LEAD_BOT_TEST_PHONES, comma-separated, last-9 match).
// Test mode keeps real leads dark while one number drives the flow end-to-end.
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
// the webhook's own patient cache before this is called, so we only need the two
// smaller tables here.
export async function isTherapistOrPayer(supabase, fromRaw) {
  const [th, py] = await Promise.all([
    supabase.from('therapists').select('telefono'),
    supabase.from('payers').select('telefono'),
  ])
  return phoneMatches(th.data, fromRaw) || phoneMatches(py.data, fromRaw)
}

// Click-to-WhatsApp ad referral → attribution fields. A CTWA entry carries a
// `referral` block on the FIRST message of the conversation; organic chats don't.
export function referralOf(msg) {
  const r = msg?.referral
  if (!r) return { source: 'whatsapp_organico', ad_source_id: null, ad_headline: null }
  return { source: 'meta_ctwa', ad_source_id: r.source_id || null, ad_headline: r.headline || null }
}

// Rule (A2): a first-contact ORGANIC sender (no ad referral) who already has an
// inbound message on record is a known contact — a therapist, a patient's relative,
// someone we already talk to — NOT a lead. Only genuine first-touch organic (no
// prior inbound) or an ad click (referral present ⇒ always a lead) creates a row.
// The current inbound is logged AFTER lead handling in the webhook, so it's never
// counted as its own "earlier" message here.
async function hasEarlierInbound(supabase, from) {
  const { data } = await supabase.from('whatsapp_messages')
    .select('id').eq('direccion', 'inbound')
    .eq('raw_payload->message->>from', String(from || '')).limit(1)
  return !!(data && data.length)
}

// Create the lead row on first contact, or return the existing one. Captures the
// WhatsApp profile name and CTWA attribution. Measurement only — sends nothing.
// Returns { lead, isNew } or null when the phone can't be normalized OR when the
// sender is a known organic contact (see hasEarlierInbound).
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
  // Organic + prior inbound ⇒ known contact, not a lead. Ad clicks skip this.
  if (source === 'whatsapp_organico' && await hasEarlierInbound(supabase, msg.from)) {
    console.log(`[lead] skip — organic known contact phone=${phone}`)
    return null
  }
  const row = { phone, wa_name: contact?.profile?.name || null, source, ad_source_id, ad_headline, stage: 'nuevo' }
  const { data, error } = await supabase.from('leads').insert(row).select('*').single()
  if (error) {
    // Two messages racing the first insert both violate the unique phone — take
    // whichever row won.
    const { data: raced } = await supabase.from('leads').select('*').eq('phone', phone).maybeSingle()
    if (raced) return { lead: raced, isNew: false }
    console.error('[lead] insert failed:', error.message)
    return null
  }
  console.log(`[lead] created ${data.id} phone=${phone} source=${source}${ad_headline ? ` ad="${ad_headline}"` : ''}`)
  return { lead: data, isNew: true }
}

// smb_message_echoes: an echo is a message the business number sent MANUALLY
// (Nicolás typing in WhatsApp, not an API send). For a lead that's the hard pause
// signal — the bot goes silent for that lead forever. This handler is also the
// Phase-A litmus test that Dualhook forwards echoes at all: every echo logs a
// distinctive marker so a single manual test message proves the pipe.
export async function handleEchoes(supabase, value) {
  const echoes = value?.message_echoes
  if (!Array.isArray(echoes) || echoes.length === 0) return 0
  let paused = 0
  for (const e of echoes) {
    const to = normalizePhone(e.to) // business → customer, so the lead is `to`
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
// Phase B — the button bot. No free-form model output ever reaches a lead: the
// LLM only CLASSIFIES free text; every message the lead sees is code-authored
// copy or a canned answer. Runs only when LEAD_BOT_LIVE==='true' and the lead
// isn't paused. All sends are best-effort — a send failure never crashes the
// webhook's 200 to Meta.
// ─────────────────────────────────────────────────────────────────────────────

const MSG1 = `Hola 🌿 Somos Efimeramente, un equipo de psicólogos en Cumbayá.

La sesión cuesta $39, o $35 c/u si compras un paquete de 4.
📍 Presencial en Cumbayá (con parqueadero privado) u online
💳 Aceptamos tarjeta
🧾 Muchos seguros privados reembolsan la terapia — te ayudamos con el trámite

El primer paso es gratis: una llamada de 10 minutos con el/la terapeuta que tú elijas.`

const MENU_BUTTONS = [
  { id: 'elegir_terapeuta', title: 'Elegir terapeuta' },
  { id: 'pregunta', title: 'Tengo una pregunta' },
]

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const DIAS_FULL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_FULL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// "lun 29 sep · 10:00" (list row title, ≤24 chars)
function humanSlot(date, time) {
  const d = new Date(`${date}T00:00:00Z`)
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES_ABBR[d.getUTCMonth()]} · ${time}`
}
// "lunes 29 de septiembre a las 10:00" (confirmation copy)
function humanDateLong(date, time) {
  const d = new Date(`${date}T00:00:00Z`)
  return `${DIAS_FULL[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES_FULL[d.getUTCMonth()]} a las ${time}`
}

// Spec calls María Gracia "Ma. Gracia"; everyone else is a single first name —
// keeps "Elegir a {name}" within the 20-char button limit.
function shortName(nombre) {
  if (nombre === 'Maria Gracia') return 'Ma. Gracia'
  return String(nombre || '').split(/\s+/)[0]
}
const freeCallLink = (therapistId) => `${APP_BASE}/agendar?terapeuta=${therapistId}`

// Persist a patch and mirror it onto the in-memory lead so a single webhook turn
// can advance several steps consistently.
async function patchLead(supabase, lead, patch) {
  patch.updated_at = new Date().toISOString()
  await supabase.from('leads').update(patch).eq('id', lead.id)
  Object.assign(lead, patch)
}
const STAGE_TS = {
  toco: 'toco_at', eligio_terapeuta: 'eligio_terapeuta_at', agendo: 'agendo_at',
  llamada_hecha: 'llamada_hecha_at', no_contesto: 'no_contesto_at', paciente: 'paciente_at', frio: 'frio_at',
}
// Advance the funnel stage, stamping its timestamp once. Among the PRE-booking
// core stages (nuevo→toco→eligio_terapeuta→agendo) it never moves backward. Every
// other transition always applies: the post-call branches (llamada_hecha /
// no_contesto), re-engagement from no_contesto/frio back to agendo, and the frio
// off-ramp. `paciente` is derived from `convirtio` elsewhere — the bot never sets it.
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

// ── Canned answers ───────────────────────────────────────────────────────────
// The two next-step buttons attached to every answer (B2). id 'elegir_terapeuta'
// and 'pregunta' reuse the handleTap routes, so an answer flows straight back into
// the funnel or the FAQ list.
const ANSWER_BUTTONS = [
  { id: 'elegir_terapeuta', title: 'Elegir terapeuta' },
  { id: 'pregunta', title: 'Otra pregunta' },
]
const MAPS_LINK = 'https://maps.app.goo.gl/GZAFUpC1SAyW8GBT8'
const ANSWER_COPY = {
  precio: 'La primera sesión cuesta $39 (o $35 c/u en paquete de 4). Antes de eso, una llamada gratuita de 10 min con tu terapeuta.',
  ubicacion: '📍 Estamos en Cumbayá, a 3 minutos del Scala, con parqueadero privado y seguro.\n💻 También atendemos online.',
  seguro: 'Muchos seguros privados reembolsan terapia psicológica, según tu plan (Bupa y Humana, por ejemplo, reembolsan hasta el 80%). Te damos la factura con el formato que piden y te ayudamos con el trámite.',
  pago: '💳 Puedes pagar por transferencia bancaria o con tarjeta de crédito/débito (Payphone).\n📦 También tenemos un paquete de 4 sesiones por $140 ($35 c/u).',
}
const CONTENT = new Set(['precio', 'ubicacion', 'seguro', 'pago'])

// Answer a question as ONE interactive message: the canned copy is the body, the
// two next-step buttons are attached (B2). The bot never re-prompts on its own
// afterward. Ubicación is the one two-part send: the Maps link goes first as a
// text so its rich preview renders, then the note carries the buttons.
async function answerIntent(to, intent) {
  if (intent === 'ubicacion') {
    await sendText(to, MAPS_LINK, { previewUrl: true })
    await sendButtons(to, ANSWER_COPY.ubicacion, ANSWER_BUTTONS)
    return
  }
  await sendButtons(to, ANSWER_COPY[intent] || ANSWER_COPY.precio, ANSWER_BUTTONS)
}

// Plain answer copy, no buttons — used on first contact, where Message 1 (sent
// right after) carries the call-to-action buttons (B4).
async function sendAnswerText(to, intent) {
  if (intent === 'ubicacion') {
    await sendText(to, MAPS_LINK, { previewUrl: true })
    await sendText(to, ANSWER_COPY.ubicacion)
    return
  }
  await sendText(to, ANSWER_COPY[intent] || ANSWER_COPY.precio)
}

// ── Classification: keyword/regex FIRST, LLM only as a fallback (B1) ──────────
// Keyword match is deterministic, free, and instant. Content intents win over a
// greeting so "hola, ¿dónde están?" answers the question. "domicilio" is
// deliberately NOT a location keyword — home visits aren't offered, so it falls
// through to a human handoff. Returns an intent or null (→ LLM fallback).
function classifyKeywords(text) {
  const t = ` ${String(text || '').toLowerCase()} `
  const has = (re) => re.test(t)
  if (has(/cu[aá]nto|cuesta|costo|valor|precio|tarifa|evaluaci[oó]n|consulta/)) return 'precio'
  if (has(/d[oó]nde|ubica|direcci[oó]n|queda|local|presencial|online|virtual|parqueadero/)) return 'ubicacion'
  if (has(/seguro|aseguradora|reembolso|cobertura/)) return 'seguro'
  if (has(/tarjeta|transferencia|pagar|paquete/)) return 'pago'
  if (has(/gracias|\bok\b|perfecto/)) return 'gracias'
  if (has(/hola|buenas/)) return 'saludo'
  return null
}

// Full classification: keyword first, LLM (APIMart, model proven working in
// proofOcr) only when keywords miss. Returns 'precio'|'ubicacion'|'seguro'|'pago'|
// 'gracias'|'saludo'|'otro'|null. 'otro'/null ⇒ the caller hands off to a human.
async function classifyIntent(text) {
  const kw = classifyKeywords(text)
  if (kw) return kw
  return await classifyFreeText(text)
}

// LLM fallback (classify-only; APIMart). Returns 'precio'|'ubicacion'|'seguro'|
// 'pago'|'otro', or null on API error/empty (caller treats both as a handoff).
async function classifyFreeText(text) {
  const apiKey = process.env.APIMART_API_KEY
  if (!apiKey) return null
  const prompt = `Eres un clasificador. Clasifica el mensaje de un posible paciente de una consulta psicológica en EXACTAMENTE una de estas categorías y responde SOLO con la palabra, sin nada más:
precio — pregunta por costo, valor, cuánto cuesta.
ubicacion — pregunta dónde están, la dirección, o si atienden presencial u online.
seguro — pregunta por seguros médicos, reembolso, o factura para el seguro.
pago — pregunta cómo pagar (transferencia, tarjeta, paquetes).
otro — cualquier otra cosa, incluyendo visitas o atención a domicilio, disponibilidad de un terapeuta específico, o dudas que no encajan arriba.

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

// ── Escalate to Nicolás + pause the bot for this lead forever ────────────────
// urgent=true marks a crisis/clinical handoff so the push reads URGENTE (the
// lead may already have received a containment line with ECU 911).
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

// Standard handoff copy (T3). Kept as a const so the AI-derive path can send the
// same line and log it.
const HANDOFF_LINE = 'Te escribe una persona del equipo en unos minutos 🌿'

// Hand the conversation to a human: one canned line to the lead, then escalate
// (push to Nicolás + pause the bot for this lead). Used for anything the bot can't
// answer — never a self re-prompt (B6).
async function handoff(supabase, lead, reason) {
  await sendText(lead.phone, HANDOFF_LINE)
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

// ── Steps ────────────────────────────────────────────────────────────────────
async function showMessage1(supabase, lead) {
  await sendButtons(lead.phone, MSG1, MENU_BUTTONS)
  await patchLead(supabase, lead, { step_actual: 'msg1', last_bot_at: new Date().toISOString(), parse_misses: 0 })
}

async function showCategoryList(supabase, lead) {
  await advanceStage(supabase, lead, 'toco')
  const { data: cats } = await supabase.from('funnel_categorias')
    .select('clave, etiqueta, orden').eq('activo', true).order('orden')
  const rows = (cats || []).map((c) => ({ id: `cat:${c.clave}`, title: c.etiqueta }))
  await sendList(lead.phone, '¿Qué te gustaría trabajar?', 'Ver temas', rows, { sectionTitle: 'Temas' })
  await patchLead(supabase, lead, { step_actual: 'categoria', last_bot_at: new Date().toISOString(), parse_misses: 0 })
}

// Resolve up to 3 therapist cards for a category: fixed ordered list filtered by
// recibe_nuevos (so Daniela/off therapists drop and everyone moves up), or the
// "No estoy seguro(a)" rule (3 soonest-available, Francisco always included).
async function resolveCards(supabase, clave) {
  const { data: cat } = await supabase.from('funnel_categorias').select('*').eq('clave', clave).maybeSingle()
  if (!cat) return []
  const { data: pool } = await supabase.from('therapists')
    .select('id, nombre, apellido, funnel_caption, funnel_card_url, booking_availability, calendar_email')
    .eq('recibe_nuevos', true).eq('activo', true)
  const byId = new Map((pool || []).map((t) => [t.id, t]))

  if (cat.especial === 'no_seguro') {
    const scored = []
    for (const t of pool || []) {
      const s = await nextSlots(supabase, t, 'llamada', 1)
      scored.push({ t, when: s[0] ? `${s[0].date} ${s[0].time}` : '9999-99-99 99:99' })
    }
    scored.sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : 0))
    let ordered = scored.map((x) => x.t)
    let chosen = ordered.slice(0, 3)
    if (!chosen.some((t) => t.id === FRANCISCO_ID) && byId.get(FRANCISCO_ID)) {
      chosen = [byId.get(FRANCISCO_ID), ...ordered.filter((t) => t.id !== FRANCISCO_ID)].slice(0, 3)
    }
    return chosen
  }
  return (cat.terapeutas || []).map((id) => byId.get(id)).filter(Boolean).slice(0, 3)
}

async function showCards(supabase, lead, clave) {
  const cards = await resolveCards(supabase, clave)
  if (!cards.length) {
    await sendText(lead.phone, 'En este momento no tengo terapeutas disponibles para ese tema. Escríbenos y te ayudamos directamente 🌿')
    return escalate(supabase, lead, 'sin_terapeutas')
  }
  await sendText(lead.phone, 'Estas son las personas que te recomiendo 👇')
  for (const t of cards) {
    const short = shortName(t.nombre)
    await sendImageCard(lead.phone, {
      imageLink: t.funnel_card_url || null,
      headerText: `${t.nombre} ${t.apellido}`,
      body: t.funnel_caption || `${t.nombre} ${t.apellido}`,
      button: { id: `pick:${t.id}`, title: `Elegir a ${short}` },
    })
  }
  await patchLead(supabase, lead, { step_actual: 'cards', last_bot_at: new Date().toISOString(), parse_misses: 0 })
}

async function chooseCategory(supabase, lead, clave) {
  await advanceStage(supabase, lead, 'toco')
  await patchLead(supabase, lead, { categoria: clave })
  await showCards(supabase, lead, clave)
}

async function showSlots(supabase, lead, t) {
  const short = shortName(t.nombre)
  const slots = await nextSlots(supabase, t, 'llamada', 3)
  if (!slots.length) {
    await sendText(lead.phone, `Por ahora ${short} no tiene horarios abiertos. Puedes revisar más opciones aquí:\n${freeCallLink(t.id)}`)
    await patchLead(supabase, lead, { step_actual: 'slots', last_bot_at: new Date().toISOString(), parse_misses: 0 })
    return
  }
  const rows = slots.map((s) => ({ id: `slot:${t.id}|${s.date}|${s.time}`, title: humanSlot(s.date, s.time) }))
  rows.push({ id: `vermas:${t.id}`, title: 'Ver más horarios' })
  await sendList(lead.phone,
    `Estos son los horarios más cercanos con ${short} para tu llamada gratuita de 10 minutos:`,
    'Ver horarios', rows, { sectionTitle: 'Horarios' })
  await patchLead(supabase, lead, { step_actual: 'slots', last_bot_at: new Date().toISOString(), parse_misses: 0 })
}

async function chooseTherapist(supabase, lead, therapistId) {
  const { data: t } = await supabase.from('therapists')
    .select('id, nombre, apellido, booking_availability, calendar_email, activo').eq('id', therapistId).maybeSingle()
  if (!t || !t.activo) {
    await sendText(lead.phone, 'Esa opción ya no está disponible. Elige otra, por favor 🙂')
    return renderStep(supabase, lead)
  }
  await advanceStage(supabase, lead, 'eligio_terapeuta')
  await patchLead(supabase, lead, { therapist_id: therapistId })
  await showSlots(supabase, lead, t)
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

async function showFaqList(supabase, lead) {
  await advanceStage(supabase, lead, 'toco')
  const rows = [
    { id: 'faq:ubicacion', title: 'Ubicación y modalidad' },
    { id: 'faq:seguros', title: 'Seguros' },
    { id: 'faq:pago', title: 'Formas de pago' },
    { id: 'faq:otra', title: 'Otra pregunta' },
  ]
  await sendList(lead.phone, '¿Qué te gustaría saber?', 'Ver opciones', rows, { sectionTitle: 'Preguntas' })
  await patchLead(supabase, lead, { step_actual: 'faq', last_bot_at: new Date().toISOString(), parse_misses: 0 })
}

async function answerFaq(supabase, lead, key) {
  if (key === 'otra') return handoff(supabase, lead, 'otra_pregunta')
  await answerIntent(lead.phone, key === 'seguros' ? 'seguro' : key)
  await patchLead(supabase, lead, { step_actual: 'answered', last_bot_at: new Date().toISOString(), parse_misses: 0 })
}

// Re-render whatever step the lead is on (after answering free text, or on an
// unrecognized tap). `note` is an optional one-liner sent before the re-render.
async function renderStep(supabase, lead, { note } = {}) {
  if (note) await sendText(lead.phone, note)
  const step = lead.step_actual || 'msg1'
  if (step === 'categoria') return showCategoryList(supabase, lead)
  if (step === 'cards' && lead.categoria) return showCards(supabase, lead, lead.categoria)
  if (step === 'slots' && lead.therapist_id) {
    const { data: t } = await supabase.from('therapists')
      .select('id, nombre, apellido, booking_availability, calendar_email').eq('id', lead.therapist_id).maybeSingle()
    if (t) return showSlots(supabase, lead, t)
  }
  if (step === 'faq') return showFaqList(supabase, lead)
  return sendButtons(lead.phone, '¿Quieres agendar tu llamada gratuita de 10 minutos?', MENU_BUTTONS)
}

// Recent inbound lines from this chat (oldest first), for the T2 model context.
// Only the lead's own messages are logged (outbound bot sends aren't), which is
// still useful history. The CURRENT message isn't logged yet (the webhook logs
// after runBot), so it's never double-counted. Media rows ("[imagen]"…) dropped.
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
// speak truthfully about availability without inventing times. Empty if no
// therapist chosen yet.
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

// T2 — free text. Claude answers from the fact sheet or derives to a human; the
// keyword path is the fallback only if the API is missing / fails / times out.
async function handleFreeText(supabase, lead, text) {
  // Greetings/thanks NEVER derive and never need the model (spec) — short-circuit.
  const kw = classifyKeywords(text)
  if (kw === 'gracias') { await sendText(lead.phone, '¡Con gusto! 🌿'); return }
  if (kw === 'saludo') { await sendText(lead.phone, '¡Hola! 🌿 Cuéntame, ¿en qué te puedo ayudar?'); return }

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

// Act on Claude's {accion, texto, motivo}. "responder" → send the answer with the
// [Elegir terapeuta]/[Otra pregunta] buttons re-attached (never a bare pitch).
// "derivar" → handoff; motivo "urgente" sends the model's containment line (with
// ECU 911 when there's life risk) and pushes URGENTE to Nicolás.
async function applyDecision(supabase, lead, text, d) {
  if (d.accion === 'responder') {
    const reply = d.texto || ANSWER_COPY.precio
    await sendButtons(lead.phone, reply, ANSWER_BUTTONS)
    await patchLead(supabase, lead, { step_actual: 'answered', parse_misses: 0, last_bot_at: new Date().toISOString() })
    await logDecision(supabase, lead, { text, accion: d.accion, motivo: d.motivo, reply, model: d.model, latencyMs: d.latencyMs })
    return
  }
  // derivar
  const urgent = d.motivo === 'urgente'
  const reply = urgent
    ? (d.texto || 'Gracias por escribir 🌿 En un momento te contacta una persona del equipo.')
    : HANDOFF_LINE
  await sendText(lead.phone, reply)
  await logDecision(supabase, lead, { text, accion: d.accion, motivo: d.motivo, reply, model: d.model, latencyMs: d.latencyMs })
  await escalate(supabase, lead, `${urgent ? 'URGENTE' : 'derivar'} — ${d.motivo || 'otro'}`, { urgent })
}

// Fallback when the model is unavailable: keyword/canned answers, else handoff.
async function keywordFallback(supabase, lead, text, kw) {
  const intent = kw || await classifyFreeText(text)
  if (CONTENT.has(intent)) {
    await answerIntent(lead.phone, intent)
    await patchLead(supabase, lead, { step_actual: 'answered', parse_misses: 0, last_bot_at: new Date().toISOString() })
    await logDecision(supabase, lead, { text, accion: 'responder', motivo: intent, reply: ANSWER_COPY[intent], fallback: true })
    return
  }
  const motivo = intent === 'otro' ? 'clasificado_otro' : 'no_clasificado'
  await logDecision(supabase, lead, { text, accion: 'derivar', motivo, reply: HANDOFF_LINE, fallback: true })
  return handoff(supabase, lead, motivo)
}

async function handleTap(supabase, lead, tap) {
  const id = tap.id || ''
  if (id === 'elegir_terapeuta') return showCategoryList(supabase, lead)
  if (id === 'pregunta') return showFaqList(supabase, lead)
  if (id.startsWith('cat:')) return chooseCategory(supabase, lead, id.slice(4))
  if (id.startsWith('pick:')) return chooseTherapist(supabase, lead, id.slice(5))
  if (id.startsWith('slot:')) return bookSlot(supabase, lead, id.slice(5))
  if (id.startsWith('vermas:')) return sendMoreLink(supabase, lead, id.slice(7))
  if (id.startsWith('faq:')) return answerFaq(supabase, lead, id.slice(4))
  // Follow-up template quick-replies (payload = the button text)
  if (id === 'Confirmo') { await sendText(lead.phone, '¡Perfecto! Te esperamos 🌿'); return }
  if (id === 'Cambiar hora' || id === 'Sí, reagendar') return rebookFromButton(supabase, lead)
  if (id === 'Sí, quiero agendar') return firstSessionInterest(supabase, lead)
  return renderStep(supabase, lead)
}

// A lead asking for a new time (from the call reminder's "Cambiar hora" or the
// rebook template's "Sí, reagendar") → fresh slots for the same therapist.
async function rebookFromButton(supabase, lead) {
  if (!lead.therapist_id) return renderStep(supabase, lead)
  const { data: t } = await supabase.from('therapists')
    .select('id, nombre, apellido, booking_availability, calendar_email').eq('id', lead.therapist_id).maybeSingle()
  if (!t) return renderStep(supabase, lead)
  await sendText(lead.phone, '¡Claro! Estos son los horarios disponibles 👇')
  return showSlots(supabase, lead, t)
}

// A lead tapping "Sí, quiero agendar" on the 48h first-session nudge → hand off to
// Nicolás + the therapist to schedule the paid session (spec: they coordinate it).
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

// Entry point, called from the webhook after the lead row is recorded. Self-gates
// on LEAD_BOT_LIVE + bot_paused so callers don't have to. Never throws.
export async function runBot(supabase, { lead, isNew, msg }) {
  if (!lead || lead.bot_paused) return
  if (!botAllowedForPhone(lead.phone)) return
  try {
    const tap = extractTap(msg)
    // Any inbound means the lead is active again — clear the nudge counter so a
    // fresh silence can be re-nudged (and revive them from frio via the handlers).
    if (!isNew && lead.nudges_sent > 0) await patchLead(supabase, lead, { nudges_sent: 0 })
    // First contact, or a lead who has never been sent Message 1 (e.g. they wrote
    // in while the bot was off). If that first message already asks something we can
    // answer, answer it FIRST (plain, no buttons), then send Message 1 — whose
    // buttons are the call to action (B4). A bare "hola" / the ad text just gets
    // Message 1.
    if (isNew || (!tap && !lead.step_actual)) {
      const body = msg?.type === 'text' ? (msg.text?.body || '') : ''
      const intent = body ? classifyKeywords(body) : null
      if (CONTENT.has(intent)) await sendAnswerText(lead.phone, intent)
      return await showMessage1(supabase, lead)
    }
    if (tap) return await handleTap(supabase, lead, tap)
    if (msg?.type === 'text' && msg.text?.body) return await handleFreeText(supabase, lead, msg.text.body)
    // any other inbound (image/audio/etc) mid-flow → nudge back to the buttons
    return await renderStep(supabase, lead, { note: 'Cuéntame, ¿en qué te ayudo? Elige una opción 🙂' })
  } catch (e) {
    console.warn('[bot] runBot failed (non-blocking):', e.message)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase C — follow-ups. Entry points called by the lead-followups cron (silent
// nudges, call reminder, therapist result, 48h nudge) and by the webhook (the
// therapist's Se hizo / No contestó reply). All best-effort; none throw.
// ─────────────────────────────────────────────────────────────────────────────

const leadFirstName = (lead) => String(lead?.wa_name || '').trim().split(/\s+/)[0] || ''
async function therapistShort(supabase, therapistId) {
  if (!therapistId) return 'tu terapeuta'
  const { data: t } = await supabase.from('therapists').select('nombre').eq('id', therapistId).maybeSingle()
  return t ? shortName(t.nombre) : 'tu terapeuta'
}

// Silent mid-flow nudge (resumes at step_actual). 1st at +2h, 2nd at +22h; after
// the 2nd → stage=frio. The cron owns the timing + quiet-hours gating; this owns
// the send + counter. last_bot_at is re-anchored so the next threshold is measured
// from this nudge.
export async function nudgeLead(supabase, lead) {
  if (lead.bot_paused) return 'skipped'
  const n = (lead.nudges_sent || 0) + 1
  const note = n === 1
    ? '¿Seguimos con tu llamada gratuita de 10 minutos? 🌿'
    : 'Seguimos aquí 🌿 Cuando quieras, agenda tu llamada gratuita de 10 minutos.'
  try {
    await renderStep(supabase, lead, { note })
  } catch (e) { console.error('[followups] nudge failed:', e.message); return 'failed' }
  const patch = { nudges_sent: n, last_bot_at: new Date().toISOString() }
  if (n >= 2) { patch.stage = 'frio'; if (!lead.frio_at) patch.frio_at = new Date().toISOString() }
  await patchLead(supabase, lead, patch)
  return 'sent'
}

// Call reminder (recordatorio_llamada) — sent to the LEAD ~1h before the call.
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

// Therapist result (resultado_llamada) — sent to the THERAPIST ~5 min after the
// call ends. Stores the returned wamid so the therapist's reply maps back here.
export async function sendResultForLead(supabase, lead, therapist, hora) {
  const toE164 = normalizePhone(therapist.telefono)
  if (!toE164) { console.warn(`[followups] therapist ${therapist.id} has no phone`); return 'skipped' }
  try {
    const wamid = await sendCallResult(toE164, { therapist: shortName(therapist.nombre), name: leadFirstName(lead), hora })
    await patchLead(supabase, lead, { resultado_llamada_at: new Date().toISOString(), resultado_llamada_wamid: wamid })
    return 'sent'
  } catch (e) { console.error('[followups] result failed:', e.message); return 'failed' }
}

// 48h first-session nudge (primera_sesion) — sent to the LEAD.
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
// Returns true if this inbound was a therapist-result reply (handled), else false
// so the webhook can keep routing. Matches the lead via the reply's context.id
// (the stored wamid), falling back to the therapist's most recent pending result.
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
  // No contestó → mark + one rebook message to the lead (template; window likely closed).
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
