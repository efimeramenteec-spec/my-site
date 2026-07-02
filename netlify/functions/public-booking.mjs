// netlify/functions/public-booking.mjs
//
// The ONLY public (unauthenticated) surface of the app: prospective patients
// book a free 10-minute "llamada" from /agendar. The browser never touches
// Supabase for this flow — this function validates everything and writes with
// the service role. Do NOT open anon RLS on patients/sessions instead.
//
//   GET  ?action=therapists                       → bookable therapists (public-safe fields only)
//   GET  ?action=slots&therapist=<id>&date=<ISO>  → free 10-min start times (Ecuador tz)
//   POST ?action=book                             → validate + create patient/session/calendar event
//
// Availability = configured weekly windows (therapists.booking_availability)
// minus Google Calendar busy minus existing Supabase sessions, with min-notice
// and horizon applied. Freebusy failures FAIL CLOSED (no slots offered) — a
// transient "no hay horarios" beats double-booking a therapist's calendar.
// Anti-abuse: honeypot field + per-phone/per-IP rate limits (booking_attempts
// table — see supabase/public-booking.sql) + strict input validation.

import { getSupabaseAdmin, normalizePhone } from '../lib/whatsapp.mjs'
import { getCalendarClient, queryFreebusy } from '../lib/calendar.mjs'

const ALLOWED_ORIGINS = [
  'https://efimeramente-panel.netlify.app',
  'https://genuine-praline-0f8e70.netlify.app',
  'http://localhost:5173',
]

// Global booking config (v1) — promote to per-therapist columns if ever needed.
const SLOT_STEP_MIN = 30       // candidate start times every 30 min
const CALL_MIN = 10            // llamada length
const MIN_NOTICE_H = 12        // no bookings sooner than this
const HORIZON_DAYS = 14        // no bookings further out than this
const TZ = 'America/Guayaquil'
const TZ_OFFSET = '-05:00'     // Ecuador, no DST
const MAX_PER_PHONE_PER_DAY = 2
const MAX_PER_IP_PER_HOUR = 5

// booking_availability keys, indexed by Date#getUTCDay() of the calendar date.
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)

// Today's date in Ecuador (UTC-5, no DST).
const ecTodayStr = (now) => new Date(now.getTime() - 5 * 3600e3).toISOString().slice(0, 10)
const addDaysStr = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
}

// Free start times ("HH:MM", Ecuador local) for one therapist on one date.
// Used by ?action=slots AND re-run at book time to verify the slot still holds.
// Throws when availability can't be determined (Supabase/freebusy failure).
async function computeSlots(supabase, therapist, date) {
  const now = new Date()
  const today = ecTodayStr(now)
  if (date < today || date > addDaysStr(today, HORIZON_DAYS)) return []

  const dayKey = DAY_KEYS[new Date(`${date}T00:00:00Z`).getUTCDay()]
  const windows = (therapist.booking_availability || {})[dayKey] || []
  if (!Array.isArray(windows) || windows.length === 0) return []

  // Existing sessions that day (any tipo) block their whole span.
  const { data: sessions, error: sErr } = await supabase
    .from('sessions')
    .select('hora_inicio, hora_fin, estado')
    .eq('terapeuta_id', therapist.id)
    .eq('fecha', date)
  if (sErr) throw new Error(`sessions query failed: ${sErr.message}`)
  const busy = (sessions || [])
    .filter((s) => s.estado !== 'cancelada' && s.estado !== 'no_show')
    .map((s) => [toMin(String(s.hora_inicio).slice(0, 5)), toMin(String(s.hora_fin).slice(0, 5))])

  // Google Calendar busy periods, as minutes since Ecuador midnight of `date`.
  const dayStartMs = new Date(`${date}T00:00:00${TZ_OFFSET}`).getTime()
  if (therapist.calendar_email) {
    const calendar = getCalendarClient()
    const gBusy = await queryFreebusy(
      calendar, therapist.calendar_email,
      `${date}T00:00:00${TZ_OFFSET}`, `${date}T23:59:59${TZ_OFFSET}`,
    )
    for (const b of gBusy) {
      busy.push([
        (new Date(b.start).getTime() - dayStartMs) / 60000,
        (new Date(b.end).getTime() - dayStartMs) / 60000,
      ])
    }
  }

  const minStartMs = now.getTime() + MIN_NOTICE_H * 3600e3
  const slots = []
  for (const w of windows) {
    const [ws, we] = Array.isArray(w) ? w : []
    if (!HHMM.test(ws || '') || !HHMM.test(we || '')) continue
    for (let s = toMin(ws); s + CALL_MIN <= toMin(we); s += SLOT_STEP_MIN) {
      const e = s + CALL_MIN
      if (busy.some(([bs, be]) => s < be && e > bs)) continue
      if (dayStartMs + s * 60000 < minStartMs) continue
      slots.push(toHHMM(s))
    }
  }
  return [...new Set(slots)].sort()
}

export default async (req) => {
  const origin = req.headers.get('origin') || ''
  const cors = corsHeaders(origin)
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } })

  // 204 must have a null body (see calendar.mjs) or the preflight 502s.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    console.error('[public-booking] SUPABASE_SERVICE_KEY not set')
    return json({ error: 'server_misconfigured' }, 500)
  }

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  // ── Bookable therapists — public-safe fields ONLY (never calendar_email,
  //    telefono, email or anything else).
  if (req.method === 'GET' && action === 'therapists') {
    const { data, error } = await supabase
      .from('therapists')
      .select('id, nombre, apellido, color')
      .eq('booking_enabled', true)
      .eq('activo', true)
      .order('nombre', { ascending: true })
    if (error) {
      console.error('[public-booking] therapists query:', error.message)
      return json({ error: 'unavailable' }, 500)
    }
    return json({ therapists: data || [] })
  }

  // ── Free slots for one therapist + date.
  if (req.method === 'GET' && action === 'slots') {
    const therapistId = url.searchParams.get('therapist') || ''
    const date = url.searchParams.get('date') || ''
    if (!therapistId || !ISO_DATE.test(date)) return json({ error: 'bad_request' }, 400)

    const { data: t, error } = await supabase
      .from('therapists')
      .select('id, booking_enabled, booking_availability, calendar_email, activo')
      .eq('id', therapistId)
      .single()
    if (error || !t || !t.booking_enabled || !t.activo) return json({ error: 'not_bookable' }, 404)

    try {
      const slots = await computeSlots(supabase, t, date)
      return json({ slots })
    } catch (e) {
      console.error('[public-booking] slots failed:', e.message)
      return json({ error: 'unavailable' }, 500)
    }
  }

  // ── Book: validate → rate-limit → re-verify slot → upsert patient → session
  //    → best-effort calendar event.
  if (req.method === 'POST' && action === 'book') {
    let body
    try { body = await req.json() } catch { return json({ error: 'bad_request' }, 400) }
    const { therapist_id: therapistId, date, start_time: startTime, patient, website } = body || {}

    // Honeypot: humans never see this field; bots fill it. Pretend success.
    if (website) return json({ ok: true })

    if (!therapistId || !ISO_DATE.test(date || '') || !HHMM.test(startTime || '')) {
      return json({ error: 'bad_request' }, 400)
    }
    const nombre = String(patient?.nombre || '').trim().slice(0, 80)
    const apellido = String(patient?.apellido || '').trim().slice(0, 80)
    const phone = normalizePhone(patient?.telefono)
    const email = String(patient?.email || '').trim().slice(0, 120)
    const motivo = String(patient?.motivo || '').trim().slice(0, 500)
    if (!nombre || !apellido) return json({ error: 'invalid_name' }, 400)
    if (!phone) return json({ error: 'invalid_phone' }, 400)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'invalid_email' }, 400)

    // Rate limit: log every attempt, then count recent rows (the current attempt
    // included). Store failures fail OPEN — the honeypot + validation still hold,
    // and a broken ledger must not take the funnel down.
    const ip = req.headers.get('x-nf-client-connection-ip')
      || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
      || 'unknown'
    const { error: aErr } = await supabase.from('booking_attempts').insert({ ip, phone })
    if (aErr) console.error('[public-booking] attempt log failed:', aErr.message)
    const [phoneRes, ipRes] = await Promise.all([
      supabase.from('booking_attempts').select('id', { count: 'exact', head: true })
        .eq('phone', phone).gte('created_at', new Date(Date.now() - 24 * 3600e3).toISOString()),
      supabase.from('booking_attempts').select('id', { count: 'exact', head: true })
        .eq('ip', ip).gte('created_at', new Date(Date.now() - 3600e3).toISOString()),
    ])
    if ((phoneRes.count ?? 0) > MAX_PER_PHONE_PER_DAY || (ipRes.count ?? 0) > MAX_PER_IP_PER_HOUR) {
      return json({ error: 'rate_limited' }, 429)
    }

    const { data: t, error: tErr } = await supabase
      .from('therapists')
      .select('id, nombre, apellido, booking_enabled, booking_availability, calendar_email, activo')
      .eq('id', therapistId)
      .single()
    if (tErr || !t || !t.booking_enabled || !t.activo) return json({ error: 'not_bookable' }, 404)

    // Re-verify the exact slot is still free (covers concurrent bookings and any
    // calendar changes since the browser fetched slots).
    let slots
    try {
      slots = await computeSlots(supabase, t, date)
    } catch (e) {
      console.error('[public-booking] verify failed:', e.message)
      return json({ error: 'unavailable' }, 500)
    }
    if (!slots.includes(startTime)) return json({ error: 'slot_taken' }, 409)

    // Upsert patient by phone: reuse an existing record (never overwrite it) —
    // same matching as the Twilio webhook (normalized E.164 or last 9 digits).
    const { data: patients, error: pErr } = await supabase.from('patients').select('id, telefono')
    if (pErr) {
      console.error('[public-booking] patients query:', pErr.message)
      return json({ error: 'booking_failed' }, 500)
    }
    const existing = (patients || []).find(
      (p) => normalizePhone(p.telefono) === phone || last9(p.telefono) === last9(phone),
    )
    let patientId = existing?.id
    if (!patientId) {
      const newPatient = { nombre, apellido, telefono: phone, terapeuta_id: t.id }
      if (email) newPatient.email = email
      if (motivo) newPatient.motivo_consulta = motivo
      const res = await supabase.from('patients').insert(newPatient).select('id').single()
      if (res.error) {
        console.error('[public-booking] patient insert:', res.error.message)
        return json({ error: 'booking_failed' }, 500)
      }
      patientId = res.data.id
    }

    const endTime = toHHMM(toMin(startTime) + CALL_MIN)
    const { data: session, error: sErr } = await supabase
      .from('sessions')
      .insert({
        patient_id: patientId,
        terapeuta_id: t.id,
        fecha: date,
        hora_inicio: `${startTime}:00`,
        hora_fin: `${endTime}:00`,
        tipo: 'llamada',
        modalidad: 'en_linea',
        estado: 'programada',
        monto: 0,
        pagado: false,
      })
      .select('id')
      .single()
    if (sErr) {
      console.error('[public-booking] session insert:', sErr.message)
      return json({ error: 'booking_failed' }, 500)
    }

    // Google Calendar event — best-effort, NEVER blocks the booking. No WhatsApp
    // reminder for llamadas (send-reminders excludes tipo='llamada').
    if (t.calendar_email) {
      try {
        const calendar = getCalendarClient()
        const ev = await calendar.events.insert({
          calendarId: t.calendar_email,
          requestBody: {
            summary: `Llamada — ${nombre} ${apellido} · 10 min`,
            description: [`Tel: ${phone}`, motivo && `Motivo: ${motivo}`].filter(Boolean).join('\n'),
            start: { dateTime: `${date}T${startTime}:00`, timeZone: TZ },
            end: { dateTime: `${date}T${endTime}:00`, timeZone: TZ },
          },
        })
        if (ev.data.id) {
          await supabase.from('sessions').update({ google_event_id: ev.data.id }).eq('id', session.id)
        }
      } catch (e) {
        console.warn('[public-booking] calendar create failed (non-blocking):', e.message)
      }
    }

    // Confirmation echo only — no ids, no PII beyond what the booker typed.
    return json({ ok: true, therapist_name: `${t.nombre} ${t.apellido}`, date, start_time: startTime })
  }

  return json({ error: 'bad_request' }, 400)
}
