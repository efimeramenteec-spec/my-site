// netlify/functions/public-booking.mjs
//
// The ONLY public (unauthenticated) surface of the app. Two flows share it:
//   /agendar  (kind=llamada, default) — free 10-min intro call, open to anyone.
//   /reservar (kind=sesion)           — real 60-min individual session; link is
//                                       shared privately by the practice.
// The browser never touches Supabase for this flow — this function validates
// everything and writes with the service role. Do NOT open anon RLS on
// patients/sessions instead.
//
//   GET  ?action=therapists                                → bookable therapists (public-safe fields only)
//   GET  ?action=slots&therapist=<id>&date=<ISO>[&kind=…]  → free start times (Ecuador tz)
//   POST ?action=book                                      → validate + create patient/session/calendar event
//
// Availability = configured weekly windows (therapists.booking_availability)
// minus Google Calendar busy minus existing Supabase sessions, with min-notice
// and horizon applied. Freebusy failures FAIL CLOSED (no slots offered) — a
// transient "no hay horarios" beats double-booking a therapist's calendar.
// Anti-abuse: honeypot field + per-phone/per-IP rate limits (booking_attempts
// table — see supabase/public-booking.sql) + strict input validation.

import { getSupabaseAdmin, normalizePhone } from '../lib/whatsapp.mjs'
import { computeSlots, createBooking, KINDS, HHMM, ISO_DATE } from '../lib/booking.mjs'

const ALLOWED_ORIGINS = [
  'https://efimeramente-panel.netlify.app',
  'https://genuine-praline-0f8e70.netlify.app',
  'http://localhost:5173',
]

// The slot engine, room cap, patient upsert, Calendar sync and therapist push
// all live in ../lib/booking.mjs now (shared with the lead bot). This file keeps
// only the public HTTP shell: CORS, honeypot, rate limits and input validation.
const MAX_PER_PHONE_PER_DAY = 2
const MAX_PER_IP_PER_HOUR = 5

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
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
    const kind = KINDS[url.searchParams.get('kind')] || KINDS.llamada
    if (!therapistId || !ISO_DATE.test(date)) return json({ error: 'bad_request' }, 400)

    const { data: t, error } = await supabase
      .from('therapists')
      .select('id, booking_enabled, booking_availability, calendar_email, activo')
      .eq('id', therapistId)
      .single()
    if (error || !t || !t.booking_enabled || !t.activo) return json({ error: 'not_bookable' }, 404)

    try {
      const slots = await computeSlots(supabase, t, date, kind.durMin)
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
    const kindKey = KINDS[body?.kind] ? body.kind : 'llamada'
    // Sessions carry a patient-chosen modalidad; llamadas are always en línea.
    const modalidad = kindKey === 'sesion' && body?.modalidad === 'presencial' ? 'presencial' : 'en_linea'

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

    // Delegate the core (re-verify slot → room cap → upsert patient → session →
    // Calendar + push) to the shared engine. A free llamada creates a LEAD; a
    // /reservar real session creates/promotes a patient — createBooking's es_lead
    // default (kind==='llamada') already encodes that.
    const result = await createBooking(supabase, {
      therapist: t, date, startTime, kindKey, modalidad,
      patient: { nombre, apellido, telefono: phone, email: email || undefined, motivo: motivo || undefined },
    })
    if (!result.ok) {
      const status = result.error === 'slot_taken' || result.error === 'rooms_full' ? 409
        : result.error === 'unavailable' ? 500 : 500
      return json({ error: result.error }, status)
    }

    // Confirmation echo only — no ids, no PII beyond what the booker typed.
    return json({ ok: true, therapist_name: result.therapistName, date, start_time: startTime })
  }

  return json({ error: 'bad_request' }, 400)
}
