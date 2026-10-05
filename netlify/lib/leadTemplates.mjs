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
        // Trailing static text is required — Meta rejects a variable at the end,
        // and a trailing emoji doesn't count as text, so end with real words.
        text: 'Hola {{1}} 🌿 ¿Cómo fue la llamada con {{2}} de las {{3}}? Cuéntanos cómo te fue.',
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
        // Trailing static text is required — Meta rejects a variable at the end.
        text: 'Hola {{1}} 🌿 ¿Te gustaría agendar tu primera sesión con {{2}}? Escríbenos y la coordinamos.',
        example: { body_text: [['María', 'Francisco']] } },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Sí, quiero agendar' }] },
    ],
  },
]

// _v2 — same templates in Nico's voice (#41): no emojis, no ¡ ¿, signed "Att: Nico".
// Same language, variable order, examples and BUTTON TEXTS as v1 (the reply
// handlers in leadBot.mjs match on button text, so they work for both). New names
// instead of editing v1 in place — an edit sends v1 back to review and blocks
// sends meanwhile. Sends auto-switch to a _v2 once Meta APPROVES it (pickTemplateName).
const v1 = (name) => TEMPLATES.find((t) => t.name === name)
const v1Buttons = (name) => v1(name).components.find((c) => c.type === 'BUTTONS')
const v1Example = (name) => v1(name).components.find((c) => c.type === 'BODY').example
export const TEMPLATES_V2 = [
  { name: 'recordatorio_llamada_v2', base: 'recordatorio_llamada', to: 'lead', language: LANG, category: 'UTILITY',
    components: [
      { type: 'BODY',
        text: 'Hola {{1}}, te recuerdo tu llamada gratuita de 10 minutos con {{2}} hoy a las {{3}}. Te llamará a este mismo número. Att: Nico',
        example: v1Example('recordatorio_llamada') },
      v1Buttons('recordatorio_llamada'),
    ] },
  { name: 'resultado_llamada_v2', base: 'resultado_llamada', to: 'therapist', language: LANG, category: 'UTILITY',
    components: [
      { type: 'BODY',
        text: 'Hola {{1}}, cómo fue la llamada con {{2}} de las {{3}}? Toca una opción para registrarla.',
        example: v1Example('resultado_llamada') },
      v1Buttons('resultado_llamada'),
    ] },
  // MARKETING — the category Meta gave rebook_llamada v1.
  { name: 'rebook_llamada_v2', base: 'rebook_llamada', to: 'lead', language: LANG, category: 'MARKETING',
    components: [
      { type: 'BODY',
        text: 'Hola {{1}}, no pudimos contactarte para tu llamada gratuita con {{2}}. Quieres que la reagendemos? Att: Nico',
        example: v1Example('rebook_llamada') },
      v1Buttons('rebook_llamada'),
    ] },
  { name: 'primera_sesion_v2', base: 'primera_sesion', to: 'lead', language: LANG, category: 'UTILITY',
    components: [
      { type: 'BODY',
        text: 'Hola {{1}}, te gustaría agendar tu primera sesión con {{2}}? Escríbeme y la coordinamos. Att: Nico',
        example: v1Example('primera_sesion') },
      v1Buttons('primera_sesion'),
    ] },
]
// Owner templates (#45). ping_nico is the ONE universal ping to Nicolás when his
// 24h window is closed: his "Ver" tap opens the window and the owner outbox
// (ownerOutbox.mjs) flushes. Never add another owner template — route through
// notifyOwner. No emoji, no ¡¿, body ends on static text.
export const PING_TEMPLATE = 'ping_nico'
export const OWNER_TEMPLATES = [
  { name: PING_TEMPLATE, to: 'owner', language: LANG, category: 'UTILITY',
    components: [
      { type: 'BODY',
        text: 'Hola Nicolás, tienes una actualización pendiente en tu cuenta de Efimeramente: {{1}}. Toca Ver para revisarla.',
        example: { body_text: [['2 facturas listas para aprobar']] } },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Ver' }] },
    ] },
]
// Therapist templates (#52). sesion_pendiente = the daily 08:30 reminder for a past
// session still in Pendiente, used only when the therapist's 24h window is closed
// (lib/sesionesPendientes.mjs). Copy approved by Nicolás: no ¡¿, the 🐚✨ signature
// is allowed for therapist messages. Quick-reply payloads (est_ok:/est_no:<id>) are
// set per message at send time (sendSesionPendiente).
export const SESION_PENDIENTE_TEMPLATE = 'sesion_pendiente'
export const SESION_PENDIENTE_BODY =
  'Hola {{1}}! Hay una sesión que se quedó en estado pendiente.\n\n{{2}}, del {{3}}\n\nSe dio la sesión?\n\nAtt: La Caracola Mágica🐚✨'
export const STAFF_TEMPLATES = [
  { name: SESION_PENDIENTE_TEMPLATE, to: 'therapist', language: LANG, category: 'UTILITY',
    components: [
      { type: 'BODY', text: SESION_PENDIENTE_BODY,
        example: { body_text: [['Sophia', 'Cecilia Saltos + Valentina Loor', '2 de octubre']] } },
      { type: 'BUTTONS', buttons: [
        { type: 'QUICK_REPLY', text: 'Ocurrió' },
        { type: 'QUICK_REPLY', text: 'No ocurrió' },
      ] },
    ] },
]
// Broadcast templates (#53). Used by lib/broadcast.mjs for recipients whose 24h
// window is closed, once Meta APPROVES them (any category). The body is the copy
// Nicolás approved, character for character — never edit it in place (an edit
// sends it back to review); the free-form send (open window) is the same body.
export const MARIANA_RETOMA_TEMPLATE = 'mariana_retoma'
export const MARIANA_RETOMA_BODY =
  'Hola {{1}}!\n' +
  'Buenas noticias, Mariana ya está aceptando sesiones nuevamente, así que ya puedes retomar tu proceso. \n' +
  'Por el momento y hasta nuevo aviso, las sesiones sólo podrán ser virtuales y a partir de las 11:00AM (Hora de Ecuador)\n' +
  'Las sesiones presenciales se irán retomando progresivamente en las próximas semanas.\n' +
  'Para agendar tu sesión directamente, puedes usar este link:\n' +
  'https://efimeramente-panel.netlify.app/reservar?terapeuta=b219e764-4664-594c-9eb3-d2b19e52caac\n' +
  '\n' +
  'Si quieres comentarle algo a Mariana puedes escribirle directamente, como de costumbre.\n' +
  'Un abrazo, esperamos verte pronto❤️‍🩹'
export const BROADCAST_TEMPLATES = [
  { name: MARIANA_RETOMA_TEMPLATE, to: 'patient', language: LANG, category: 'MARKETING',
    components: [
      { type: 'BODY', text: MARIANA_RETOMA_BODY, example: { body_text: [['Carlos']] } },
    ] },
]
const ALL_TEMPLATES = [...TEMPLATES, ...TEMPLATES_V2, ...OWNER_TEMPLATES, ...STAFF_TEMPLATES, ...BROADCAST_TEMPLATES]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Fast read of the current Meta status of our templates (name → status/category).
export async function listTemplates() {
  const apiKey = process.env.WA_DUALHOOK_API_KEY
  if (!apiKey) throw new Error('WA_DUALHOOK_API_KEY missing')
  const names = ALL_TEMPLATES.map((t) => t.name)
  const res = await fetch(`${TEMPLATES_URL}?fields=name,status,category,language,rejected_reason&limit=100`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const txt = await res.text()
  if (!res.ok) return { status: res.status, body: txt.slice(0, 300) }
  let json
  try { json = JSON.parse(txt) } catch { return { status: res.status, body: txt.slice(0, 300) } }
  const mine = (json.data || []).filter((t) => names.includes(t.name))
  return { status: res.status, templates: mine }
}

// Submit templates for Meta review (default: the _v2 set; pass names to pick). Idempotent-ish: Meta rejects a duplicate
// name with a clear error, which we report rather than treat as fatal. Backs off
// on Dualhook's 429 circuit breaker (retries each create up to 3x). Returns a
// per-template result array.
export async function submitTemplates(onlyNames = null) {
  const apiKey = process.env.WA_DUALHOOK_API_KEY
  if (!apiKey) throw new Error('WA_DUALHOOK_API_KEY missing — no submit performed')
  const results = []
  const pick = onlyNames ? ALL_TEMPLATES.filter((t) => onlyNames.includes(t.name)) : TEMPLATES_V2
  for (const t of pick) {
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

// ── v1 → v2 auto-switch ───────────────────────────────────────────────────────
// One GET of the WABA's template statuses, cached per run (lead-followups primes
// it at the start of each */15 run; the webhook's rebook send fetches lazily,
// TTL 15 min). Send <base>_v2 only if it's APPROVED in the category we asked for
// (a reclassified one waits for a human decision); anything else, or a failed
// fetch, keeps v1.
const STATUS_TTL = 15 * 60e3
let statusCache = null // { at, promise → Map(name → {status, category}) | null }

async function fetchStatuses() {
  try {
    const out = await listTemplates()
    if (!out.templates) { console.warn('[templates] status fetch failed', out.status); return null }
    return new Map(out.templates.map((t) => [t.name, { status: t.status, category: t.category }]))
  } catch (e) { console.warn('[templates] status fetch error', e.message); return null }
}
export function primeTemplateStatuses() {
  statusCache = { at: Date.now(), promise: fetchStatuses() }
  return statusCache.promise
}
export function pickTemplateName(base, statuses) {
  const v2 = TEMPLATES_V2.find((t) => t.base === base)
  const s = v2 && statuses?.get(v2.name)
  return s && s.status === 'APPROVED' && s.category === v2.category ? v2.name : base
}
async function resolveName(base) {
  if (!statusCache || Date.now() - statusCache.at > STATUS_TTL) primeTemplateStatuses()
  return pickTemplateName(base, await statusCache.promise)
}

// ── Sends ─────────────────────────────────────────────────────────────────────
async function sendTemplate(to, base, bodyParams) {
  const name = await resolveName(base)
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

// ping_nico — {{1}} = one-line resumen. Sent only by ownerOutbox.mjs.
export const sendOwnerPing = (ownerE164, resumen) =>
  sendTemplate(ownerE164, PING_TEMPLATE, [resumen])

// sesion_pendiente — {{1}} nombre, {{2}} patient label, {{3}} "2 de octubre";
// the two quick replies carry est_ok:<id> / est_no:<id> as their payloads.
// Returns the wamid. Sent only by sesionesPendientes.mjs (once APPROVED).
export async function sendSesionPendiente(therapistE164, { nombre, paciente, fecha, sessionId }) {
  const apiKey = process.env.WA_DUALHOOK_API_KEY
  if (!apiKey) throw new Error('WA_DUALHOOK_API_KEY missing — no send performed')
  const p = (v) => ({ type: 'text', text: (v == null || String(v).trim() === '') ? '—' : String(v).trim() })
  const qr = (index, payload) => ({ type: 'button', sub_type: 'quick_reply', index: String(index), parameters: [{ type: 'payload', payload }] })
  const body = {
    messaging_product: 'whatsapp',
    to: String(therapistE164).replace(/^\+/, ''),
    type: 'template',
    template: {
      name: SESION_PENDIENTE_TEMPLATE, language: { code: LANG },
      components: [
        { type: 'body', parameters: [nombre, paciente, fecha].map(p) },
        qr(0, `est_ok:${sessionId}`),
        qr(1, `est_no:${sessionId}`),
      ],
    },
  }
  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Dualhook ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data?.messages?.[0]?.id || null
}

// Broadcast template (#53) — {{1}} = saludo. Sent only by lib/broadcast.mjs.
export async function sendBroadcastTemplate(toE164, name, saludo) {
  const apiKey = process.env.WA_DUALHOOK_API_KEY
  if (!apiKey) throw new Error('WA_DUALHOOK_API_KEY missing — no send performed')
  const body = {
    messaging_product: 'whatsapp',
    to: String(toE164).replace(/^\+/, ''),
    type: 'template',
    template: {
      name, language: { code: LANG },
      components: [{ type: 'body', parameters: [{ type: 'text', text: String(saludo).trim() }] }],
    },
  }
  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Dualhook ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data?.messages?.[0]?.id || null
}

export const sendCallReminder =(toE164, { name, therapist, hora }) =>
  sendTemplate(toE164, 'recordatorio_llamada', [name, therapist, hora])
export const sendCallResult = (therapistE164, { therapist, name, hora }) =>
  sendTemplate(therapistE164, 'resultado_llamada', [therapist, name, hora])
export const sendRebook = (toE164, { name, therapist }) =>
  sendTemplate(toE164, 'rebook_llamada', [name, therapist])
export const sendFirstSessionNudge = (toE164, { name, therapist }) =>
  sendTemplate(toE164, 'primera_sesion', [name, therapist])
