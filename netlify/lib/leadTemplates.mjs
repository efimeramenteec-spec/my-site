// netlify/lib/leadTemplates.mjs
//
// Meta message templates for the lead-funnel follow-ups (#20) + the code that
// submits them for review and sends them. Templates are needed only for sends
// that fall OUTSIDE an open 24h/72h customer window (a proactive reminder, a call
// result to a therapist, a rebook or a first-session nudge days later). The bot
// flow itself uses free-form session messages (waSend.mjs) and never waits on
// these — only the follow-ups do.
//
// Submitted via the Dualhook proxy (Cloud API shape): POST to the WABA's
// /message_templates. Dualhook 429s with a bare "Rate limit exceeded" if creates
// are fired too fast — submitTemplates backs off between each.
//
// Env: WA_DUALHOOK_API_KEY.

const DUALHOOK_BASE = 'https://api.dualhook.com/v25.0'
const WABA_ID = '1857507018469524'
const SEND_URL = `${DUALHOOK_BASE}/915558374975708/messages`
const TEMPLATES_URL = `${DUALHOOK_BASE}/${WABA_ID}/message_templates`
const LANG = 'es'

// The four follow-up templates. recordatorio_llamada + resultado_llamada are the
// two named in the build order; rebook_llamada + primera_sesion are required for
// the no-show rebook and the 48h nudge, whose sends land after the 24h window has
// closed and therefore cannot be free-form. All UTILITY, "tú", 🌿 kept.
export const TEMPLATES = [
  {
    name: 'recordatorio_llamada',
    to: 'lead',
    language: LANG,
    category: 'UTILITY',
    components: [
      { type: 'BODY',
        text: 'Hola {{1}} 🌿 Te recordamos tu llamada gratuita de 10 minutos con {{2}} hoy a las {{3}}. Te llamará a este número.',
        example: { body_text: [['María', 'Francisco', '10:00']] } },
      { type: 'BUTTONS', buttons: [
        { type: 'QUICK_REPLY', text: 'Confirmo' },
        { type: 'QUICK_REPLY', text: 'Cambiar hora' },
      ] },
    ],
  },
  {
    name: 'resultado_llamada',
    to: 'therapist',
    language: LANG,
    category: 'UTILITY',
    components: [
      { type: 'BODY',
        text: 'Hola {{1}} 🌿 ¿Cómo fue la llamada con {{2}} de las {{3}}?',
        example: { body_text: [['Francisco', 'María', '10:00']] } },
      { type: 'BUTTONS', buttons: [
        { type: 'QUICK_REPLY', text: 'Se hizo' },
        { type: 'QUICK_REPLY', text: 'No contestó' },
      ] },
    ],
  },
  {
    name: 'rebook_llamada',
    to: 'lead',
    language: LANG,
    category: 'UTILITY',
    components: [
      { type: 'BODY',
        text: 'Hola {{1}} 🌿 No pudimos contactarte para tu llamada gratuita con {{2}}. ¿Quieres reagendarla?',
        example: { body_text: [['María', 'Francisco']] } },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Sí, reagendar' }] },
    ],
  },
  {
    name: 'primera_sesion',
    to: 'lead',
    language: LANG,
    category: 'UTILITY',
    components: [
      { type: 'BODY',
        text: 'Hola {{1}} 🌿 ¿Te gustaría agendar tu primera sesión con {{2}}?',
        example: { body_text: [['María', 'Francisco']] } },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Sí, quiero agendar' }] },
    ],
  },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Fast read of the current Meta status of our templates (name → status/category).
export async function listTemplates() {
  const apiKey = process.env.WA_DUALHOOK_API_KEY
  if (!apiKey) throw new Error('WA_DUALHOOK_API_KEY missing')
  const names = TEMPLATES.map((t) => t.name)
  const res = await fetch(`${TEMPLATES_URL}?fields=name,status,category,language&limit=100`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const txt = await res.text()
  if (!res.ok) return { status: res.status, body: txt.slice(0, 300) }
  let json
  try { json = JSON.parse(txt) } catch { return { status: res.status, body: txt.slice(0, 300) } }
  const mine = (json.data || []).filter((t) => names.includes(t.name))
  return { status: res.status, templates: mine }
}

// Submit all templates for Meta review. Idempotent-ish: Meta rejects a duplicate
// name with a clear error, which we report rather than treat as fatal. Backs off
// on Dualhook's 429 circuit breaker (retries each create up to 3x). Returns a
// per-template result array.
export async function submitTemplates() {
  const apiKey = process.env.WA_DUALHOOK_API_KEY
  if (!apiKey) throw new Error('WA_DUALHOOK_API_KEY missing — no submit performed')
  const results = []
  for (const t of TEMPLATES) {
    const body = {
      name: t.name, language: t.language, category: t.category,
      allow_category_change: true, components: t.components,
    }
    let attempt = 0, done = false
    while (!done && attempt < 3) {
      attempt++
      const res = await fetch(TEMPLATES_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const txt = await res.text()
      if (res.status === 429) { await sleep(1500 * attempt); continue }
      results.push({ name: t.name, status: res.status, body: txt.slice(0, 300) })
      done = true
    }
    if (!done) results.push({ name: t.name, status: 429, body: 'rate-limited after retries' })
    await sleep(1200) // stay under Dualhook's create rate limit between templates
  }
  return results
}

// ── Sends ─────────────────────────────────────────────────────────────────────
async function sendTemplate(to, name, bodyParams) {
  const apiKey = process.env.WA_DUALHOOK_API_KEY
  if (!apiKey) throw new Error('WA_DUALHOOK_API_KEY missing — no send performed')
  const p = (v) => ({ type: 'text', text: (v == null || String(v).trim() === '') ? '—' : String(v).trim() })
  const body = {
    messaging_product: 'whatsapp',
    to: String(to).replace(/^\+/, ''),
    type: 'template',
    template: {
      name, language: { code: LANG },
      components: [{ type: 'body', parameters: bodyParams.map(p) }],
    },
  }
  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Dualhook ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data?.messages?.[0]?.id || null // wamid, for reply-context matching
}

export const sendCallReminder = (toE164, { name, therapist, hora }) =>
  sendTemplate(toE164, 'recordatorio_llamada', [name, therapist, hora])
export const sendCallResult = (therapistE164, { therapist, name, hora }) =>
  sendTemplate(therapistE164, 'resultado_llamada', [therapist, name, hora])
export const sendRebook = (toE164, { name, therapist }) =>
  sendTemplate(toE164, 'rebook_llamada', [name, therapist])
export const sendFirstSessionNudge = (toE164, { name, therapist }) =>
  sendTemplate(toE164, 'primera_sesion', [name, therapist])
