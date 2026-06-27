// Data layer. Every function tries Supabase first (when configured) and
// transparently falls back to demo data on misconfig or network error,
// returning a `source: 'live' | 'demo'` flag the UI can surface.
import { supabase, isSupabaseConfigured } from './supabase.js'
import { getDemoStore, demoCreateSession, demoUpdateSession } from './demoStore.js'
import { dateKey, weekRange, addDays } from './format.js'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const isActive = (s) => s.estado !== 'cancelada' && s.estado !== 'no_show'

// Joined select used everywhere we need patient + therapist names/colors.
const SESSION_SELECT =
  'id,patient_id,terapeuta_id,fecha,hora_inicio,hora_fin,tipo,modalidad,estado,monto,pagado,metodo_pago,notas,google_event_id,' +
  'patient:patients(id,nombre,apellido,telefono),therapist:therapists(id,nombre,apellido,color,calendar_email)'

// Only real columns may be written to the sessions table.
const SESSION_COLUMNS = [
  'patient_id', 'terapeuta_id', 'fecha', 'hora_inicio', 'hora_fin',
  'tipo', 'modalidad', 'estado', 'monto', 'pagado', 'metodo_pago', 'notas', 'google_event_id',
]
const pickColumns = (obj) =>
  Object.fromEntries(SESSION_COLUMNS.filter((k) => k in obj).map((k) => [k, obj[k]]))

// ─── Google Calendar sync (best-effort, never blocks session save) ──────────

const CALENDAR_FN = '/.netlify/functions/calendar'
const TZ = 'America/Guayaquil'

function buildCalendarEvent(session) {
  const patientName = session.patient
    ? `${session.patient.nombre} ${session.patient.apellido}`
    : 'Paciente'
  return {
    summary: `Sesión — ${patientName} · ${session.modalidad === 'virtual' ? 'Virtual' : 'Presencial'}`,
    description: session.notas || '',
    start: { dateTime: `${session.fecha}T${session.hora_inicio}`, timeZone: TZ },
    end:   { dateTime: `${session.fecha}T${session.hora_fin}`,    timeZone: TZ },
  }
}

async function callCalendar(action, calendarId, calEvent, eventId) {
  try {
    const res = await fetch(CALENDAR_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, calendarId, event: calEvent, eventId }),
    })
    const json = await res.json()
    return json // { success, eventId? }
  } catch (err) {
    console.warn('[calendar] sync failed (non-blocking):', err?.message)
    return { success: false }
  }
}

// ─── Dashboard ──────────────────────────────────────────────────

function computeDashboard(data, now) {
  const todayKey = dateKey(now)
  const { start, end, monday } = weekRange(now)
  const sessions = data.sessions || []
  const patients = data.patients || []

  const sesionesHoy = sessions.filter((s) => s.fecha === todayKey && isActive(s)).length
  const sesionesSemana = sessions.filter(
    (s) => s.fecha >= start && s.fecha <= end && isActive(s),
  ).length

  // Money owed = sessions already delivered (past), not cancelled, not yet paid.
  const pendientes = sessions.filter((s) => s.fecha < todayKey && isActive(s) && !s.pagado)
  const pagosPendientes = {
    count: pendientes.length,
    total: pendientes.reduce((a, s) => a + Number(s.monto || 0), 0),
  }

  const pacientesActivos = patients.filter((p) => p.estado_general === 'activo').length

  const upcoming = sessions
    .filter((s) => s.fecha >= todayKey && (s.estado === 'programada' || s.estado === 'confirmada'))
    .sort((a, b) => `${a.fecha} ${a.hora_inicio}`.localeCompare(`${b.fecha} ${b.hora_inicio}`))
    .slice(0, 3)

  const todays = sessions.filter((s) => s.fecha === todayKey)
  const whatsapp = {
    confirmadas: todays.filter((s) => s.estado === 'confirmada').length,
    pendientes: todays.filter((s) => s.estado === 'programada').length,
    canceladas: todays.filter((s) => s.estado === 'cancelada' || s.estado === 'no_show').length,
  }

  const weekly = WEEKDAYS.map((label, i) => {
    const k = dateKey(addDays(monday, i))
    return {
      day: label,
      fecha: k,
      count: sessions.filter((s) => s.fecha === k && isActive(s)).length,
      isToday: k === todayKey,
    }
  })

  return {
    stats: { sesionesHoy, sesionesSemana, pagosPendientes, pacientesActivos },
    upcoming,
    whatsapp,
    weekly,
  }
}

async function fetchDashboardFromSupabase(now) {
  const { start } = weekRange(now)
  const horizon = dateKey(addDays(now, 30))
  const [patientsRes, sessionsRes] = await Promise.all([
    supabase.from('patients').select('id,nombre,apellido,estado_general,terapeuta_id'),
    supabase
      .from('sessions')
      .select(SESSION_SELECT)
      .gte('fecha', start)
      .lte('fecha', horizon)
      .order('fecha', { ascending: true })
      .order('hora_inicio', { ascending: true }),
  ])
  if (patientsRes.error) throw patientsRes.error
  if (sessionsRes.error) throw sessionsRes.error
  return { patients: patientsRes.data || [], sessions: sessionsRes.data || [] }
}

export async function getDashboardData() {
  const now = new Date()
  if (isSupabaseConfigured) {
    try {
      const data = await fetchDashboardFromSupabase(now)
      return { source: 'live', ...computeDashboard(data, now) }
    } catch (err) {
      console.warn('[efimeramente] Supabase unavailable, showing demo data:', err?.message || err)
    }
  }
  const store = getDemoStore()
  return { source: 'demo', ...computeDashboard(store, now) }
}

// ─── Sesiones ───────────────────────────────────────────────────

export async function getSessionsData() {
  if (isSupabaseConfigured) {
    try {
      const [sRes, pRes, tRes] = await Promise.all([
        supabase.from('sessions').select(SESSION_SELECT)
          .order('fecha', { ascending: true }).order('hora_inicio', { ascending: true }),
        supabase.from('patients').select('id,nombre,apellido,telefono,terapeuta_id,estado_general')
          .order('nombre', { ascending: true }),
        supabase.from('therapists').select('id,nombre,apellido,color,calendar_email,activo')
          .order('nombre', { ascending: true }),
      ])
      if (sRes.error) throw sRes.error
      if (pRes.error) throw pRes.error
      if (tRes.error) throw tRes.error
      return { source: 'live', sessions: sRes.data || [], patients: pRes.data || [], therapists: tRes.data || [] }
    } catch (err) {
      console.warn('[efimeramente] Supabase unavailable, showing demo data:', err?.message || err)
    }
  }
  const store = getDemoStore()
  return {
    source: 'demo',
    sessions: [...store.sessions],
    patients: [...store.patients],
    therapists: [...store.therapists],
  }
}

export async function createSession(payload) {
  const data = pickColumns(payload)
  if (isSupabaseConfigured) {
    try {
      const res = await supabase.from('sessions').insert(data).select(SESSION_SELECT).single()
      if (res.error) throw res.error
      const session = res.data
      // Best-effort Google Calendar sync
      const calEmail = session.therapist?.calendar_email
      if (calEmail) {
        const calRes = await callCalendar('create', calEmail, buildCalendarEvent(session))
        if (calRes.success && calRes.eventId) {
          // Store the Google event ID back on the session row (fire-and-forget)
          supabase.from('sessions').update({ google_event_id: calRes.eventId }).eq('id', session.id).then(() => {})
          session.google_event_id = calRes.eventId
        }
      }
      return { ok: true, data: session }
    } catch (err) {
      return { ok: false, error: err?.message || 'No se pudo guardar la sesión.' }
    }
  }
  return { ok: true, data: demoCreateSession(data) }
}

export async function updateSession(id, patch) {
  const data = pickColumns(patch)
  if (isSupabaseConfigured) {
    try {
      const res = await supabase.from('sessions').update(data).eq('id', id).select(SESSION_SELECT).single()
      if (res.error) throw res.error
      const session = res.data
      // Best-effort Google Calendar sync
      const calEmail = session.therapist?.calendar_email
      const eventId = session.google_event_id
      if (calEmail && eventId) {
        const isCancelled = session.estado === 'cancelada' || session.estado === 'no_show'
        if (isCancelled) {
          callCalendar('delete', calEmail, null, eventId).then(() => {})
        } else {
          callCalendar('update', calEmail, buildCalendarEvent(session), eventId).then(() => {})
        }
      }
      return { ok: true, data: session }
    } catch (err) {
      return { ok: false, error: err?.message || 'No se pudo actualizar la sesión.' }
    }
  }
  return { ok: true, data: demoUpdateSession(id, data) }
}

export function cancelSession(id) {
  return updateSession(id, { estado: 'cancelada' })
}
