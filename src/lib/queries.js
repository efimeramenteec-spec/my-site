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
  'id,patient_id,terapeuta_id,fecha,hora_inicio,hora_fin,tipo,modalidad,estado,monto,pagado,metodo_pago,notas,' +
  'patient:patients(id,nombre,apellido,telefono),therapist:therapists(id,nombre,apellido,color)'

// Only real columns may be written to the sessions table.
const SESSION_COLUMNS = [
  'patient_id', 'terapeuta_id', 'fecha', 'hora_inicio', 'hora_fin',
  'tipo', 'modalidad', 'estado', 'monto', 'pagado', 'metodo_pago', 'notas',
]
const pickColumns = (obj) =>
  Object.fromEntries(SESSION_COLUMNS.filter((k) => k in obj).map((k) => [k, obj[k]]))

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

  const pendientes = sessions.filter((s) => s.estado === 'completada' && !s.pagado)
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
        supabase.from('therapists').select('id,nombre,apellido,color,activo')
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
      return { ok: true, data: res.data }
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
      return { ok: true, data: res.data }
    } catch (err) {
      return { ok: false, error: err?.message || 'No se pudo actualizar la sesión.' }
    }
  }
  return { ok: true, data: demoUpdateSession(id, data) }
}

export function cancelSession(id) {
  return updateSession(id, { estado: 'cancelada' })
}
