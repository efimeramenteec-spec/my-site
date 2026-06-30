// netlify/functions/twilio-webhook.js
//
// Inbound Twilio webhook (v1 / CommonJS) — fires when a patient taps a quick-reply
// button on the WhatsApp reminder. Finds the matching session, updates its estado,
// and returns empty TwiML 200 (Twilio's webhook contract). Matches calendar.js
// v1 style. Node 18+ (Netlify default).
//
// Twilio posts application/x-www-form-urlencoded with fields incl.:
//   From          — "whatsapp:+593…"
//   ButtonPayload — the payload ID configured on the tapped quick-reply button
//   ButtonText    — the visible button label
//
// Wire this URL as the template's / messaging service's inbound webhook in Twilio:
//   https://efimeramente-panel.netlify.app/.netlify/functions/twilio-webhook
//   (or /api/twilio-webhook via the netlify.toml redirect)
//
// ── ENV ───────────────────────────────────────────────────────────────────────
//   SUPABASE_URL          — defaults to the project URL below if unset
//   SUPABASE_SERVICE_KEY  — service_role JWT (already set in Netlify env)
//
// BUTTON PAYLOADS (confirmed): exact ButtonPayload match —
//   "confirmed" → estado 'confirmada',  "canceled" → estado 'cancelada'.
//
// ⚠️ Requires sessions.reminder_sent_at — see supabase/add-reminder-sent-at.sql.

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vnityzpuhnkumsyfnskz.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

// Empty TwiML — 200 + text/xml with <Response/> tells Twilio "received, no reply".
const TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
const twiml = (statusCode = 200) => ({
  statusCode,
  headers: { 'Content-Type': 'text/xml' },
  body: TWIML_EMPTY,
})

// Exact ButtonPayload → estado map (IDs confirmed in the Twilio template).
const BUTTON_TO_ESTADO = { confirmed: 'confirmada', canceled: 'cancelada' }

// Same best-effort E.164 normalization as send-reminders.js.
function normalizePhone(raw) {
  if (!raw) return null
  const p = String(raw).trim().replace(/[\s()\-.]/g, '')
  if (p.startsWith('+')) return /^\+\d{8,15}$/.test(p) ? p : null
  if (/^\d+$/.test(p)) {
    if (p.startsWith('593')) return `+${p}`
    if (p.length === 9 || p.length === 10) return `+593${p.replace(/^0/, '')}`
  }
  return null
}
const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return twiml(405)
  if (!SUPABASE_SERVICE_KEY) { console.error('[twilio-webhook] no SUPABASE_SERVICE_KEY'); return twiml(200) }

  const params = new URLSearchParams(event.body || '')
  const fromRaw = (params.get('From') || '').replace(/^whatsapp:/, '')
  const buttonPayload = params.get('ButtonPayload') || ''
  const buttonText = params.get('ButtonText') || ''
  console.log(`[twilio-webhook] From=${fromRaw} payload=${buttonPayload} text=${buttonText}`)

  const estado = BUTTON_TO_ESTADO[buttonPayload.trim()]
  if (!estado) { console.warn(`[twilio-webhook] unmapped ButtonPayload "${buttonPayload}" — ignoring`); return twiml(200) }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

  // 1. Match patient by phone. Robust: exact normalized E.164 OR last-9-digits,
  //    since a handful of seed telefonos aren't clean E.164. (151 rows — cheap.)
  const { data: patients, error: pErr } = await supabase.from('patients').select('id, telefono')
  if (pErr) { console.error('[twilio-webhook] patients fetch:', pErr.message); return twiml(200) }
  const fromNorm = normalizePhone(fromRaw)
  const from9 = last9(fromRaw)
  const patient = (patients || []).find((p) => {
    const n = normalizePhone(p.telefono)
    return (fromNorm && n === fromNorm) || (from9 && last9(p.telefono) === from9)
  })
  if (!patient) { console.warn(`[twilio-webhook] no patient matched phone ${fromRaw}`); return twiml(200) }

  // 2. Soonest upcoming, already-reminded 'programada' session for this patient
  //    (handles a patient with multiple future sessions).
  const today = new Date().toISOString().slice(0, 10)
  const { data: sess, error: sErr } = await supabase
    .from('sessions')
    .select('id, fecha, hora_inicio')
    .eq('patient_id', patient.id)
    .eq('estado', 'programada')
    .not('reminder_sent_at', 'is', null)
    .gte('fecha', today)
    .order('fecha', { ascending: true })
    .order('hora_inicio', { ascending: true })
    .limit(1)
  if (sErr) { console.error('[twilio-webhook] sessions fetch:', sErr.message); return twiml(200) }
  const session = sess?.[0]
  if (!session) { console.warn(`[twilio-webhook] no reminded programada session for patient ${patient.id}`); return twiml(200) }

  // 3. Apply the estado from the button tap.
  const { error: uErr } = await supabase.from('sessions').update({ estado }).eq('id', session.id)
  if (uErr) console.error('[twilio-webhook] update failed:', uErr.message)
  else console.log(`[twilio-webhook] session ${session.id} → ${estado} (patient ${patient.id})`)

  return twiml(200) // always 200 empty TwiML, even on no-match, per Twilio contract
}
