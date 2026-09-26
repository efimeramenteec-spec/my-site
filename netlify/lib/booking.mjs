// netlify/lib/booking.mjs
//
// The ONE slot + booking engine. Extracted from public-booking.mjs so the lead
// bot (whatsapp-cloud-webhook.mjs) books free calls through exactly the same
// availability math, room cap, patient upsert, Calendar sync and therapist push —
// no second slot engine (spec #4). public-booking.mjs keeps its own HTTP shell
// (CORS, honeypot, rate limits, validation) and delegates the core to createBooking.
//
// Availability = configured weekly windows (therapists.booking_availability) minus
// Google Calendar busy minus existing Supabase sessions, with min-notice + horizon.
// Freebusy failure FAILS CLOSED (throws) — a transient "no hay horarios" beats
// double-booking a therapist's calendar.

import { normalizePhone } from './whatsapp.mjs'
import { getCalendarClient, queryFreebusy } from './calendar.mjs'
import { notifyTherapist } from './push.mjs'

export const SLOT_STEP_MIN = 30
export const CALL_MIN = 10
export const SESSION_MIN = 60
// Per-kind booking parameters. Unknown kinds fall back to llamada.
export const KINDS = {
  llamada: { durMin: CALL_MIN, tipo: 'llamada' },
  sesion: { durMin: SESSION_MIN, tipo: 'individual' },
}
const MIN_NOTICE_H = 12
const HORIZON_DAYS = 14
// Only 3 physical consultorios: at most 3 PRESENCIAL sessions overlap at once
// across ALL therapists. Keep in sync with conflicts.js CONSULTORIOS and the DB
// trigger enforce_presencial_room_cap.
const CONSULTORIOS = 3
export const TZ = 'America/Guayaquil'
const TZ_OFFSET = '-05:00'

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
export const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
export const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)

export const ecTodayStr = (now) => new Date(now.getTime() - 5 * 3600e3).toISOString().slice(0, 10)
export const addDaysStr = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Free start times ("HH:MM", Ecuador local) for one therapist on one date.
// Used by ?action=slots, the bot's slot list, AND re-run at book time to verify
// the slot still holds. Throws when availability can't be determined.
export async function computeSlots(supabase, therapist, date, durMin = CALL_MIN) {
  const now = new Date()
  const today = ecTodayStr(now)
  if (date < today || date > addDaysStr(today, HORIZON_DAYS)) return []

  const dayKey = DAY_KEYS[new Date(`${date}T00:00:00Z`).getUTCDay()]
  const windows = (therapist.booking_availability || {})[dayKey] || []
  if (!Array.isArray(windows) || windows.length === 0) return []

  const { data: sessions, error: sErr } = await supabase
    .from('sessions')
    .select('hora_inicio, hora_fin, estado')
    .eq('terapeuta_id', therapist.id)
    .eq('fecha', date)
  if (sErr) throw new Error(`sessions query failed: ${sErr.message}`)
  const busy = (sessions || [])
    .filter((s) => s.estado !== 'cancelada' && s.estado !== 'no_show')
    .map((s) => [toMin(String(s.hora_inicio).slice(0, 5)), toMin(String(s.hora_fin).slice(0, 5))])

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
    for (let s = toMin(ws); s + durMin <= toMin(we); s += SLOT_STEP_MIN) {
      const e = s + durMin
      if (busy.some(([bs, be]) => s < be && e > bs)) continue
      if (dayStartMs + s * 60000 < minStartMs) continue
      slots.push(toHHMM(s))
    }
  }
  return [...new Set(slots)].sort()
}

// The next `count` free slots for a therapist across the booking horizon, as
// [{ date, time }], starting today. Used by the bot to offer "3 soonest slots".
export async function nextSlots(supabase, therapist, kindKey = 'llamada', count = 3) {
  const kind = KINDS[kindKey] || KINDS.llamada
  const today = ecTodayStr(new Date())
  const out = []
  for (let i = 0; i <= HORIZON_DAYS && out.length < count; i++) {
    const date = addDaysStr(today, i)
    let slots = []
    try { slots = await computeSlots(supabase, therapist, date, kind.durMin) }
    catch { slots = [] } // one bad day shouldn't kill the whole search
    for (const time of slots) {
      out.push({ date, time })
      if (out.length >= count) break
    }
  }
  return out
}

// Core booking: verify slot → room cap → upsert patient by phone → insert session
// → best-effort Calendar event + therapist push. Shared by the public HTTP surface
// and the bot. Returns { ok, error?, sessionId?, patientId?, endTime?, therapistName? }.
// Never throws for expected outcomes (slot_taken / rooms_full / booking_failed) —
// callers map those to user-facing copy. `notify` toggles the therapist push.
export async function createBooking(supabase, {
  therapist: t, date, startTime, kindKey = 'llamada', modalidad = 'en_linea',
  patient, esLead, fuente, notify = true,
}) {
  const kind = KINDS[kindKey] || KINDS.llamada

  let slots
  try { slots = await computeSlots(supabase, t, date, kind.durMin) }
  catch (e) { console.error('[booking] verify slots failed:', e.message); return { ok: false, error: 'unavailable' } }
  if (!slots.includes(startTime)) return { ok: false, error: 'slot_taken' }

  const bkStart = toMin(startTime)
  const bkEnd = bkStart + kind.durMin
  if (modalidad === 'presencial') {
    const { data: dayRows, error: rErr } = await supabase
      .from('sessions').select('hora_inicio, hora_fin, estado')
      .eq('fecha', date).eq('modalidad', 'presencial')
    if (rErr) { console.error('[booking] room check:', rErr.message); return { ok: false, error: 'booking_failed' } }
    const roomsTaken = (dayRows || []).filter((s) => {
      if (s.estado === 'cancelada' || s.estado === 'no_show') return false
      const ss = toMin(String(s.hora_inicio).slice(0, 5))
      const se = toMin(String(s.hora_fin).slice(0, 5))
      return bkStart < se && ss < bkEnd
    }).length
    if (roomsTaken >= CONSULTORIOS) return { ok: false, error: 'rooms_full' }
  }

  const phone = normalizePhone(patient?.telefono)
  if (!phone) return { ok: false, error: 'invalid_phone' }
  const { data: patients, error: pErr } = await supabase.from('patients').select('id, telefono, tarifa')
  if (pErr) { console.error('[booking] patients query:', pErr.message); return { ok: false, error: 'booking_failed' } }
  const existing = (patients || []).find(
    (p) => normalizePhone(p.telefono) === phone || last9(p.telefono) === last9(phone),
  )
  let patientId = existing?.id
  if (!patientId) {
    const newPatient = {
      nombre: String(patient.nombre || '').trim() || 'Lead',
      apellido: String(patient.apellido || '').trim(),
      telefono: phone, terapeuta_id: t.id,
      es_lead: esLead ?? (kindKey === 'llamada'),
    }
    if (patient.email) newPatient.email = patient.email
    if (patient.motivo) newPatient.motivo_consulta = patient.motivo
    if (fuente) newPatient.fuente = fuente
    const res = await supabase.from('patients').insert(newPatient).select('id').single()
    if (res.error) { console.error('[booking] patient insert:', res.error.message); return { ok: false, error: 'booking_failed' } }
    patientId = res.data.id
  }

  const monto = kindKey === 'sesion' ? (existing?.tarifa ?? 39) : 0
  const endTime = toHHMM(toMin(startTime) + kind.durMin)
  const { data: session, error: sErr } = await supabase
    .from('sessions').insert({
      patient_id: patientId, terapeuta_id: t.id, fecha: date,
      hora_inicio: `${startTime}:00`, hora_fin: `${endTime}:00`,
      tipo: kind.tipo, modalidad, estado: 'programada', monto, pagado: false,
    }).select('id').single()
  if (sErr) { console.error('[booking] session insert:', sErr.message); return { ok: false, error: 'booking_failed' } }

  if (kindKey === 'sesion') {
    await supabase.from('patients').update({ es_lead: false }).eq('id', patientId).eq('es_lead', true)
  }

  if (notify) {
    const [, mm, dd] = date.split('-')
    await notifyTherapist(supabase, t.id, {
      title: kindKey === 'sesion' ? 'Nueva sesión agendada 📅' : 'Nueva llamada agendada 📞',
      body: `${patient.nombre || ''} ${patient.apellido || ''} — ${dd}/${mm} ${startTime} (${kind.durMin} min)`.trim(),
      url: '/sesiones',
    })
  }

  if (t.calendar_email) {
    try {
      const name = `${patient.nombre || ''} ${patient.apellido || ''}`.trim()
      const summary = kindKey === 'sesion'
        ? `Sesión — ${name} · ${modalidad === 'presencial' ? 'Presencial' : 'En línea'}`
        : `Llamada — ${name} · 10 min`
      const calendar = getCalendarClient()
      const ev = await calendar.events.insert({
        calendarId: t.calendar_email,
        requestBody: {
          summary,
          description: [`Tel: ${phone}`, patient.motivo && `Motivo: ${patient.motivo}`].filter(Boolean).join('\n'),
          start: { dateTime: `${date}T${startTime}:00`, timeZone: TZ },
          end: { dateTime: `${date}T${endTime}:00`, timeZone: TZ },
        },
      })
      if (ev.data.id) await supabase.from('sessions').update({ google_event_id: ev.data.id }).eq('id', session.id)
    } catch (e) {
      console.warn('[booking] calendar create failed (non-blocking):', e.message)
    }
  }

  return { ok: true, sessionId: session.id, patientId, endTime, therapistName: `${t.nombre} ${t.apellido}` }
}
