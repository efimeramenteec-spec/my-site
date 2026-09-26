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

const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)

const FRANCISCO_ID = '2f5bf11b-42a8-562f-99c9-501c62a4ca04'
const APP_BASE = process.env.URL || 'https://efimeramente-panel.netlify.app'

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

// Create the lead row on first contact, or return the existing one. Captures the
// WhatsApp profile name and CTWA attribution. Measurement only — sends nothing.
// Returns { lead, isNew } or null when the phone can't be normalized.
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
// Advance the funnel stage, stamping its timestamp once. Never moves backward.
const STAGE_ORDER = ['nuevo', 'toco', 'eligio_terapeuta', 'agendo', 'llamada_hecha', 'no_contesto', 'paciente', 'frio']
async function advanceStage(supabase, lead, stage) {
  const cur = STAGE_ORDER.indexOf(lead.stage)
  const next = STAGE_ORDER.indexOf(stage)
  const patch = {}
  if (next > cur) patch.stage = stage
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

// ── Canned FAQ answers (also reused for classified free text) ────────────────
function faqText(kind) {
  switch (kind === 'seguros' ? 'seguro' : kind) {
    case 'ubicacion': return {
      text: `https://maps.app.goo.gl/GZAFUpC1SAyW8GBT8
📍 Estamos en Cumbayá, a 3 minutos del Scala. Tenemos parqueadero privado y seguro.
💻 También atendemos online.`, preview: true,
    }
    case 'seguro': return {
      text: 'Muchos seguros privados reembolsan terapia psicológica, según tu plan (Bupa y Humana, por ejemplo, reembolsan hasta el 80%). Te damos la factura con el formato que piden y te ayudamos con el trámite.',
    }
    case 'pago': return {
      text: '💳 Puedes pagar por transferencia bancaria o con tarjeta de crédito/débito (Payphone).\n📦 También tenemos un paquete de 4 sesiones por $140 ($35 c/u).',
    }
    case 'precio': return {
      text: 'La sesión cuesta $39, o $35 c/u si compras un paquete de 4 ($140). El primer paso es gratis: una llamada de 10 minutos con la persona que elijas.',
    }
    default: return { text: '' }
  }
}
async function sendFaqAnswer(to, kind) {
  const { text, preview } = faqText(kind)
  if (text) await sendText(to, text, { previewUrl: !!preview })
}

// ── Free-text classification (classify-only; APIMart, cheap model) ───────────
// Returns 'precio'|'ubicacion'|'seguro'|'pago'|'otro', or null on API error/empty
// (the caller treats null as an unclassifiable miss).
async function classifyFreeText(text) {
  const apiKey = process.env.APIMART_API_KEY
  if (!apiKey) return null
  const prompt = `Eres un clasificador. Clasifica el mensaje de un posible paciente de una consulta psicológica en EXACTAMENTE una de estas categorías y responde SOLO con la palabra, sin nada más:
precio — pregunta por costo, valor, cuánto cuesta.
ubicacion — pregunta dónde están, dirección, si es presencial u online.
seguro — pregunta por seguros médicos, reembolso, o factura para el seguro.
pago — pregunta cómo pagar (transferencia, tarjeta, paquetes).
otro — cualquier otra cosa.

Mensaje: "${String(text).replace(/"/g, "'").slice(0, 500)}"`
  try {
    const res = await fetch('https://api.apimart.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', stream: false, max_tokens: 8, messages: [{ role: 'user', content: prompt }] }),
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
async function escalate(supabase, lead, reason) {
  await patchLead(supabase, lead, { bot_paused: true })
  try {
    await notifyTherapist(supabase, lead.therapist_id || null, {
      title: 'Lead necesita atención 🌿',
      body: `${lead.wa_name || lead.phone} — ${reason}`,
      url: '/marketing',
    })
  } catch (e) { console.warn('[bot] escalate push failed:', e.message) }
  console.log(`[bot] lead ${lead.id} escalated (${reason}) + paused`)
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
  if (key === 'otra') {
    await sendText(lead.phone, 'Con gusto 🌿 En un momento alguien del equipo te responde por aquí.')
    return escalate(supabase, lead, 'otra_pregunta')
  }
  await sendFaqAnswer(lead.phone, key)
  await sendButtons(lead.phone, '¿Quieres agendar tu llamada gratuita?', MENU_BUTTONS)
  await patchLead(supabase, lead, { step_actual: 'msg1', last_bot_at: new Date().toISOString(), parse_misses: 0 })
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

async function handleFreeText(supabase, lead, text) {
  const label = await classifyFreeText(text)
  if (label == null) {
    const misses = (lead.parse_misses || 0) + 1
    await patchLead(supabase, lead, { parse_misses: misses })
    if (misses >= 2) {
      await sendText(lead.phone, 'Déjame conectarte con alguien del equipo 🌿')
      return escalate(supabase, lead, 'no_clasificado')
    }
    return renderStep(supabase, lead, { note: '¿Podrías elegir una de las opciones? 🙂' })
  }
  if (label === 'otro') {
    await sendText(lead.phone, 'Con gusto te ayudo con eso 🌿 En un momento alguien del equipo te responde por aquí.')
    return escalate(supabase, lead, 'clasificado_otro')
  }
  await sendFaqAnswer(lead.phone, label)
  await patchLead(supabase, lead, { parse_misses: 0 })
  return renderStep(supabase, lead, { note: '¿Seguimos? Elige una opción 👇' })
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
  return renderStep(supabase, lead)
}

// Entry point, called from the webhook after the lead row is recorded. Self-gates
// on LEAD_BOT_LIVE + bot_paused so callers don't have to. Never throws.
export async function runBot(supabase, { lead, isNew, msg }) {
  if (process.env.LEAD_BOT_LIVE !== 'true') return
  if (!lead || lead.bot_paused) return
  try {
    const tap = extractTap(msg)
    // First contact, or a lead who has never been sent Message 1 (e.g. they wrote
    // in while the bot was off): open with Message 1 rather than classifying.
    if (isNew || (!tap && !lead.step_actual)) return await showMessage1(supabase, lead)
    if (tap) return await handleTap(supabase, lead, tap)
    if (msg?.type === 'text' && msg.text?.body) return await handleFreeText(supabase, lead, msg.text.body)
    // any other inbound (image/audio/etc) mid-flow → nudge back to the buttons
    return await renderStep(supabase, lead, { note: 'Cuéntame, ¿en qué te ayudo? Elige una opción 🙂' })
  } catch (e) {
    console.warn('[bot] runBot failed (non-blocking):', e.message)
  }
}
