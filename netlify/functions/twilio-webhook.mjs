// netlify/functions/twilio-webhook.mjs
//
// Modern Netlify Function (HTTP). The single HTTP surface for the WhatsApp reminder
// subsystem. Three paths:
//   • GET  ?health         → presence-only env diagnostics (booleans, no secrets)
//   • GET  ?test_session_id=<uuid> → controlled single test send (bypasses the
//                            kill-switch AND the 23–25h window). Lives here because
//                            scheduled functions can't be HTTP-invoked. ⚠️ REAL send.
//   • POST                 → Twilio inbound webhook: a quick-reply button tap sets
//                            the matching session's estado (and deletes the Google
//                            Calendar event on cancellation). Returns empty TwiML 200.
//
// Twilio posts application/x-www-form-urlencoded with From, ButtonPayload, ButtonText.
// Wire this URL as the template's inbound webhook in Twilio:
//   https://efimeramente-panel.netlify.app/.netlify/functions/twilio-webhook
//
// BUTTON PAYLOADS (confirmed in the Twilio template): "confirmed" → 'confirmada',
// "canceled" → 'cancelada'. ⚠️ Requires sessions.reminder_sent_at.

import { getSupabaseAdmin, normalizePhone, deliverReminder } from '../lib/whatsapp.mjs'
import { notifyTherapist } from '../lib/push.mjs'

// The Google Calendar function lives on this same Netlify deploy. Netlify injects
// URL = the site's primary address; fall back to the known prod URL for safety.
const CALENDAR_FN = `${process.env.URL || 'https://efimeramente-panel.netlify.app'}/.netlify/functions/calendar`

const TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
const twiml = (status = 200) => new Response(TWIML_EMPTY, { status, headers: { 'Content-Type': 'text/xml' } })
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

// Exact ButtonPayload → estado map (IDs confirmed in the Twilio template).
const BUTTON_TO_ESTADO = { confirmed: 'confirmada', canceled: 'cancelada' }
const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)

// Best-effort: remove the therapist's Google Calendar event when a session is
// cancelled via WhatsApp, mirroring the in-app cancel (queries.js updateSession).
// Never throws — a calendar hiccup must not break the Twilio 200 contract.
async function deleteCalendarEvent(calendarId, eventId) {
  if (!calendarId || !eventId) return
  try {
    const res = await fetch(CALENDAR_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', calendarId, eventId }),
    })
    const j = await res.json().catch(() => ({}))
    if (j.success) console.log(`[twilio-webhook] calendar event ${eventId} deleted`)
    else console.warn('[twilio-webhook] calendar delete not successful:', j.error)
  } catch (e) {
    console.warn('[twilio-webhook] calendar delete failed (non-blocking):', e.message)
  }
}

export default async (req) => {
  const url = new URL(req.url)

  // ── Health probe (GET ?health) — presence-only env diagnostics, no secrets.
  //    Returns BEFORE the Supabase-key check so it works even if the key is unset.
  if (req.method === 'GET' && url.searchParams.has('health')) {
    const has = (k) => Boolean(process.env[k])
    return json({
      ok: true, build: 'modern-functions',
      env: {
        SUPABASE_SERVICE_KEY: has('SUPABASE_SERVICE_KEY'),
        SUPABASE_URL: has('SUPABASE_URL'),
        TWILIO_ACCOUNT_SID: has('TWILIO_ACCOUNT_SID'),
        TWILIO_AUTH_TOKEN: has('TWILIO_AUTH_TOKEN'),
        TWILIO_WHATSAPP_FROM: has('TWILIO_WHATSAPP_FROM'),
        TWILIO_CONTENT_SID: has('TWILIO_CONTENT_SID'),
        GOOGLE_SERVICE_ACCOUNT_KEY: has('GOOGLE_SERVICE_ACCOUNT_KEY'),
        REMINDERS_LIVE: process.env.REMINDERS_LIVE === 'true',
      },
    })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) { console.error('[twilio-webhook] no SUPABASE_SERVICE_KEY'); return twiml(200) }

  // ── Manual test send (GET ?test_session_id=<uuid>) ──────────────────────────
  // Sends the reminder for ONLY that session, bypassing the kill-switch AND the
  // 23–25h window (still stamps reminder_sent_at). ⚠️ Sends a REAL WhatsApp —
  // point at a test patient / your own number.
  const testSessionId = url.searchParams.get('test_session_id')
  if (testSessionId) {
    const { data: s, error } = await supabase
      .from('sessions')
      .select('id, fecha, hora_inicio, estado, reminder_sent_at, patient:patients(nombre, apellido, telefono)')
      .eq('id', testSessionId)
      .single()
    if (error || !s) {
      console.error(`[twilio-webhook] TEST: session ${testSessionId} not found:`, error?.message || 'no row')
      return json({ test: true, test_session_id: testSessionId, error: 'session not found' }, 404)
    }
    console.log(`[twilio-webhook] TEST send for session ${testSessionId} (bypasses kill-switch + window)`)
    const status = await deliverReminder(supabase, s)
    const code = status === 'sent' ? 200 : status === 'skipped' ? 422 : 502
    return json({ test: true, test_session_id: testSessionId, status }, code)
  }

  if (req.method !== 'POST') return twiml(405)

  // ── Inbound reply (POST, application/x-www-form-urlencoded from Twilio) ──────
  const params = new URLSearchParams(await req.text())
  const fromRaw = (params.get('From') || '').replace(/^whatsapp:/, '')
  const buttonPayload = params.get('ButtonPayload') || ''
  const buttonText = params.get('ButtonText') || ''
  console.log(`[twilio-webhook] From=${fromRaw} payload=${buttonPayload} text=${buttonText}`)

  const estado = BUTTON_TO_ESTADO[buttonPayload.trim()]
  if (!estado) { console.warn(`[twilio-webhook] unmapped ButtonPayload "${buttonPayload}" — ignoring`); return twiml(200) }

  // 1. Match patient by phone: exact normalized E.164 OR last-9-digits (a handful
  //    of seed telefonos aren't clean E.164).
  const { data: patients, error: pErr } = await supabase.from('patients').select('id, telefono, nombre, apellido')
  if (pErr) { console.error('[twilio-webhook] patients fetch:', pErr.message); return twiml(200) }
  const fromNorm = normalizePhone(fromRaw)
  const from9 = last9(fromRaw)
  const patient = (patients || []).find((p) => {
    const n = normalizePhone(p.telefono)
    return (fromNorm && n === fromNorm) || (from9 && last9(p.telefono) === from9)
  })
  if (!patient) { console.warn(`[twilio-webhook] no patient matched phone ${fromRaw}`); return twiml(200) }

  // 2. Soonest upcoming, already-reminded 'programada' session for this patient.
  const today = new Date().toISOString().slice(0, 10)
  const { data: sess, error: sErr } = await supabase
    .from('sessions')
    .select('id, fecha, hora_inicio, google_event_id, terapeuta_id, therapist:therapists(calendar_email)')
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
  if (uErr) { console.error('[twilio-webhook] update failed:', uErr.message); return twiml(200) }
  console.log(`[twilio-webhook] session ${session.id} → ${estado} (patient ${patient.id})`)

  // 4. On cancellation, also remove the Google Calendar event (best-effort), so a
  //    WhatsApp cancel matches an in-app cancel. Confirmations keep the event.
  if (estado === 'cancelada') {
    await deleteCalendarEvent(session.therapist?.calendar_email, session.google_event_id)
  }

  // 5. Push-notify the therapist (best-effort — notifyTherapist never throws).
  const patientName = [patient.nombre, patient.apellido].filter(Boolean).join(' ') || 'Paciente'
  const [, mm, dd] = String(session.fecha).split('-')
  await notifyTherapist(supabase, session.terapeuta_id, {
    title: estado === 'confirmada' ? 'Sesión confirmada ✅' : 'Sesión cancelada ❌',
    body: `${patientName} — ${dd}/${mm} ${String(session.hora_inicio || '').slice(0, 5)}`,
    url: '/sesiones',
  })

  return twiml(200) // always 200 empty TwiML, even on no-match, per Twilio contract
}
