// Data layer. Every function tries Supabase first (when configured) and
// transparently falls back to demo data on misconfig or network error,
// returning a `source: 'live' | 'demo'` flag the UI can surface.
import { supabase, isSupabaseConfigured } from './supabase.js'
import {
  getDemoStore,
  demoCreateSession, demoUpdateSession, demoDeleteSession,
  demoCreatePatient, demoUpdatePatient, demoDeletePatient,
} from './demoStore.js'
// Joined select used everywhere we need patient + therapist names/colors.
const SESSION_SELECT =
  'id,patient_id,terapeuta_id,fecha,hora_inicio,hora_fin,tipo,modalidad,estado,monto,pagado,facturada,metodo_pago,notas,google_event_id,reminder_sent_at,' +
  'patient:patients(id,nombre,apellido,telefono),therapist:therapists(id,nombre,apellido,color,calendar_email)'

// Only real columns may be written to the sessions table.
const SESSION_COLUMNS = [
  'patient_id', 'terapeuta_id', 'fecha', 'hora_inicio', 'hora_fin',
  'tipo', 'modalidad', 'estado', 'monto', 'pagado', 'facturada', 'metodo_pago', 'notas', 'google_event_id',
]
const pickColumns = (obj) =>
  Object.fromEntries(SESSION_COLUMNS.filter((k) => k in obj).map((k) => [k, obj[k]]))

// \u2500\u2500\u2500 Dashboard \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

// Finance-only slim select: the Finanzas page reads ALL session history, so
// it skips the patient join and heavy columns on purpose.
const FINANZAS_SESSION_SELECT =
  'id,terapeuta_id,patient_id,fecha,tipo,estado,monto,pagado,facturada,paid_at,' +
  'therapist:therapists(id,nombre,apellido,color,provision_rate),' +
  'patient:patients(id,nombre,apellido,telefono)'

export async function getFinanzasData() {
  if (isSupabaseConfigured) {
    try {
      const [sRes, tRes] = await Promise.all([
        supabase.from('sessions').select(FINANZAS_SESSION_SELECT)
          .order('fecha', { ascending: true }),
        supabase.from('therapists').select('id,nombre,apellido,color,activo,provision_rate')
          .order('nombre', { ascending: true }),
      ])
      if (sRes.error) throw sRes.error
      if (tRes.error) throw tRes.error
      return { source: 'live', sessions: sRes.data || [], therapists: tRes.data || [] }
    } catch (err) {
      console.warn('[efimeramente] Supabase unavailable, showing demo data:', err?.message || err)
    }
  }
  const store = getDemoStore()
  return { source: 'demo', sessions: [...store.sessions], therapists: [...store.therapists] }
}


// ─── Google Calendar sync (best-effort, never blocks session save) ──────────

const CALENDAR_FN = '/.netlify/functions/calendar'
const TZ = 'America/Guayaquil'
const TZ_OFFSET = '-05:00'

function buildCalendarEvent(session) {
  const patientName = session.patient
    ? `${session.patient.nombre} ${session.patient.apellido}`
    : 'Paciente'
  return {
    summary: `Sesión — ${patientName} · ${session.modalidad === 'en_linea' ? 'En línea' : 'Presencial'}`,
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
    return json
  } catch (err) {
    console.warn('[calendar] sync failed (non-blocking):', err?.message)
    return { success: false }
  }
}

// ─── Web Push on in-app estado changes (best-effort, fire-and-forget) ───────
// Call AFTER a successful update that changed estado to confirmada/cancelada.
// The server rebuilds the notification from the DB row and excludes the acting
// user's own devices; it needs the caller's access token to know who acted.
export async function notifySessionEstado(sessionId) {
  if (!isSupabaseConfigured || !sessionId) return
  try {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (!token) return
    fetch('/.netlify/functions/notify-estado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(() => {})
  } catch (err) {
    console.warn('[push] notify failed (non-blocking):', err?.message)
  }
}

// \u2500\u2500\u2500 Sesiones \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export async function getSessionsData() {
  if (isSupabaseConfigured) {
    try {
      const [sRes, pRes, tRes] = await Promise.all([
        supabase.from('sessions').select(SESSION_SELECT)
          .order('fecha', { ascending: true }).order('hora_inicio', { ascending: true }),
        supabase.from('patients').select('id,nombre,apellido,telefono,terapeuta_id,estado_general,tarifa,metodo_pago')
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
  // Hard rule (Nicolas, 2026-07-03): every session is born Pendiente, no
  // exceptions — estado only ever changes via the toggle after creation.
  const data = { ...pickColumns(payload), estado: 'programada' }
  if (isSupabaseConfigured) {
    try {
      const res = await supabase.from('sessions').insert(data).select(SESSION_SELECT).single()
      if (res.error) throw res.error
      const session = res.data
      const calEmail = session.therapist?.calendar_email
      if (calEmail) {
        const calRes = await callCalendar('create', calEmail, buildCalendarEvent(session))
        if (calRes.success && calRes.eventId) {
          supabase.from('sessions').update({ google_event_id: calRes.eventId }).eq('id', session.id).then(() => {})
          session.google_event_id = calRes.eventId
        }
      }
      return { ok: true, data: session }
    } catch (err) {
      return { ok: false, error: err?.message || 'No se pudo guardar la sesi\u00f3n.' }
    }
  }
  return { ok: true, data: demoCreateSession(data) }
}

export async function updateSession(id, patch) {
  const data = pickColumns(patch)
  // Rule (Nicolas, 2026-07-04): a cancelled session never charges nor
  // invoices. Cancelling force-clears both flags; setting either on a
  // cancelled session is rejected below.
  if (data.estado === 'cancelada' || data.estado === 'no_show') {
    data.pagado = false
    data.facturada = false
  }
  // Server-stamped payment moment (cash-flow metric — can't be backfilled, so
  // it's recorded from 2026-07-04 on). Deliberately not in SESSION_COLUMNS:
  // client payloads can never set it directly.
  if (data.pagado === true) data.paid_at = new Date().toISOString()
  else if (data.pagado === false) data.paid_at = null
  if (isSupabaseConfigured) {
    try {
      let query = supabase.from('sessions').update(data).eq('id', id)
      // "Mark as paid/invoiced" only lands on non-cancelled rows; a cancelled
      // target matches 0 rows and surfaces as the friendly error in the catch.
      const settingFlag = data.pagado === true || data.facturada === true
      if (settingFlag && !('estado' in data)) {
        query = query.not('estado', 'in', '(cancelada,no_show)')
      }
      const res = await query.select(SESSION_SELECT).single()
      if (res.error) {
        if (res.error.code === 'PGRST116' && settingFlag) {
          throw new Error('Una sesión cancelada no se puede marcar como cobrada ni facturada.')
        }
        throw res.error
      }
      const session = res.data
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
      return { ok: false, error: err?.message || 'No se pudo actualizar la sesi\u00f3n.' }
    }
  }
  return { ok: true, data: demoUpdateSession(id, data) }
}

export function cancelSession(id) {
  return updateSession(id, { estado: 'cancelada' })
}

// Hard delete for mistaken/test bookings. The Google Calendar event is
// removed best-effort AFTER the row delete succeeds (never before).
export async function deleteSession(id) {
  if (isSupabaseConfigured) {
    try {
      const { data: session } = await supabase
        .from('sessions')
        .select(SESSION_SELECT)
        .eq('id', id)
        .single()
      const res = await supabase.from('sessions').delete().eq('id', id)
      if (res.error) throw res.error
      const calEmail = session?.therapist?.calendar_email
      if (calEmail && session?.google_event_id) {
        callCalendar('delete', calEmail, null, session.google_event_id).then(() => {})
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err?.message || 'No se pudo eliminar la sesión.' }
    }
  }
  demoDeleteSession(id)
  return { ok: true }
}

// \u2500\u2500\u2500 Pacientes \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

const PATIENT_SELECT =
  'id,nombre,apellido,telefono,email,fecha_nacimiento,terapeuta_id,' +
  'motivo_consulta,estado_general,notas,tarifa,metodo_pago,fuente,campaign_id,frecuencia,created_at,updated_at'

const PATIENT_COLUMNS = [
  'nombre', 'apellido', 'telefono', 'email', 'fecha_nacimiento',
  'terapeuta_id', 'motivo_consulta', 'estado_general', 'notas',
  'tarifa', 'metodo_pago', 'fuente', 'campaign_id', 'frecuencia',
]
const pickPatientColumns = (obj) =>
  Object.fromEntries(PATIENT_COLUMNS.filter((k) => k in obj).map((k) => [k, obj[k]]))

export async function getPatientsData() {
  if (isSupabaseConfigured) {
    try {
      const [pRes, tRes, sRes, cRes] = await Promise.all([
        supabase
          .from('patients')
          .select(PATIENT_SELECT)
          .order('nombre', { ascending: true })
          .order('apellido', { ascending: true }),
        supabase
          .from('therapists')
          .select('id,nombre,apellido,color,activo,calendar_email')
          .order('nombre', { ascending: true }),
        supabase
          .from('sessions')
          .select('id,patient_id,terapeuta_id,fecha,hora_inicio,tipo,modalidad,estado,monto,pagado,metodo_pago')
          .order('fecha', { ascending: false })
          .order('hora_inicio', { ascending: false }),
        // Campaigns power the Fuente dropdown. Owner-only RLS — non-fatal so a
        // policy hiccup can't take the whole Pacientes page down.
        supabase.from('campaigns').select('id,nombre,slug').order('created_at', { ascending: false }),
      ])
      if (pRes.error) throw pRes.error
      if (tRes.error) throw tRes.error
      if (sRes.error) throw sRes.error
      return {
        source: 'live',
        patients: pRes.data || [],
        therapists: tRes.data || [],
        sessions: sRes.data || [],
        campaigns: cRes.error ? [] : (cRes.data || []),
      }
    } catch (err) {
      console.warn('[efimeramente] Supabase unavailable, showing demo data:', err?.message || err)
    }
  }
  const store = getDemoStore()
  return {
    source: 'demo',
    patients: [...store.patients],
    therapists: [...store.therapists],
    sessions: [...store.sessions],
    campaigns: [],
  }
}

export async function createPatient(payload) {
  const data = pickPatientColumns(payload)
  if (isSupabaseConfigured) {
    try {
      const res = await supabase
        .from('patients')
        .insert(data)
        .select(PATIENT_SELECT)
        .single()
      if (res.error) throw res.error
      return { ok: true, data: res.data }
    } catch (err) {
      return { ok: false, error: err?.message || 'No se pudo crear el paciente.' }
    }
  }
  return { ok: true, data: demoCreatePatient(data) }
}

export async function updatePatient(id, patch) {
  const data = pickPatientColumns(patch)
  if (isSupabaseConfigured) {
    try {
      const res = await supabase
        .from('patients')
        .update(data)
        .eq('id', id)
        .select(PATIENT_SELECT)
        .single()
      if (res.error) throw res.error
      return { ok: true, data: res.data }
    } catch (err) {
      return { ok: false, error: err?.message || 'No se pudo actualizar el paciente.' }
    }
  }
  return { ok: true, data: demoUpdatePatient(id, data) }
}

// Hard delete for duplicated patients. sessions.patient_id is ON DELETE
// CASCADE, so all their sessions disappear with the row — their Calendar
// events are collected first and removed best-effort once the delete lands.
export async function deletePatient(id) {
  if (isSupabaseConfigured) {
    try {
      const { data: sessions } = await supabase
        .from('sessions')
        .select('google_event_id,therapist:therapists(calendar_email)')
        .eq('patient_id', id)
        .not('google_event_id', 'is', null)
      const res = await supabase.from('patients').delete().eq('id', id)
      if (res.error) throw res.error
      for (const s of sessions || []) {
        if (s.google_event_id && s.therapist?.calendar_email) {
          callCalendar('delete', s.therapist.calendar_email, null, s.google_event_id).then(() => {})
        }
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err?.message || 'No se pudo eliminar el paciente.' }
    }
  }
  demoDeletePatient(id)
  return { ok: true }
}


// ─── Seguimiento (owner + therapists) ────────────────────────────────────────
// Raw data only; all adherence/retention math lives in src/lib/adherence.js.
// RLS scopes therapists automatically: they read only their own patients and
// their own sessions, so the same page serves both roles unchanged.

const SEGUIMIENTO_SESSION_SELECT =
  'id,patient_id,terapeuta_id,fecha,tipo,estado'

export async function getSeguimientoData() {
  if (isSupabaseConfigured) {
    try {
      const [pRes, sRes, tRes] = await Promise.all([
        supabase.from('patients')
          .select('id,nombre,apellido,telefono,terapeuta_id,estado_general,frecuencia,created_at')
          .order('nombre', { ascending: true }),
        supabase.from('sessions').select(SEGUIMIENTO_SESSION_SELECT)
          .order('fecha', { ascending: true }),
        supabase.from('therapists').select('id,nombre,apellido,color,activo')
          .order('nombre', { ascending: true }),
      ])
      if (pRes.error) throw pRes.error
      if (sRes.error) throw sRes.error
      if (tRes.error) throw tRes.error
      return { source: 'live', patients: pRes.data || [], sessions: sRes.data || [], therapists: tRes.data || [] }
    } catch (err) {
      console.warn('[efimeramente] Supabase unavailable, showing demo data:', err?.message || err)
    }
  }
  const store = getDemoStore()
  return {
    source: 'demo',
    patients: [...store.patients],
    sessions: [...store.sessions],
    therapists: [...store.therapists],
  }
}

// ─── Agenda pública (per-therapist booking config, owner-edited) ────────────

const THERAPIST_BOOKING_SELECT =
  'id,nombre,apellido,color,activo,booking_enabled,booking_availability'

// Only the booking config may be written from the availability editor.
const THERAPIST_BOOKING_COLUMNS = ['booking_enabled', 'booking_availability']
const pickBookingColumns = (obj) =>
  Object.fromEntries(THERAPIST_BOOKING_COLUMNS.filter((k) => k in obj).map((k) => [k, obj[k]]))

export async function getTherapistsBooking() {
  if (isSupabaseConfigured) {
    try {
      const res = await supabase
        .from('therapists')
        .select(THERAPIST_BOOKING_SELECT)
        .order('nombre', { ascending: true })
      if (res.error) throw res.error
      return { source: 'live', therapists: res.data || [] }
    } catch (err) {
      console.warn('[efimeramente] Supabase unavailable, showing demo data:', err?.message || err)
    }
  }
  const store = getDemoStore()
  return {
    source: 'demo',
    therapists: store.therapists.map((t) => ({ booking_enabled: false, booking_availability: {}, ...t })),
  }
}

export async function updateTherapistBooking(id, patch) {
  const data = pickBookingColumns(patch)
  if (isSupabaseConfigured) {
    try {
      const res = await supabase
        .from('therapists')
        .update(data)
        .eq('id', id)
        .select(THERAPIST_BOOKING_SELECT)
        .single()
      if (res.error) throw res.error
      return { ok: true, data: res.data }
    } catch (err) {
      return { ok: false, error: err?.message || 'No se pudo guardar la disponibilidad.' }
    }
  }
  return { ok: true, data: { id, ...data } }
}

// ─── Marketing (owner-only) ──────────────────────────────────────────────────
// Campaigns + funnel attribution. Raw data is fetched here; all metric math
// (funnel rates, CPA, LTV, ROAS) lives in the Marketing page, which is the
// only consumer. Tables are owner-only via RLS, so there is no demo fallback
// with fake campaigns — demo mode just gets empty lists.

const CAMPAIGN_SELECT =
  'id,nombre,slug,fecha_inicio,fecha_fin,activa,spend,impressions,clicks,conversations,notas,created_at'

const CAMPAIGN_COLUMNS = [
  'nombre', 'slug', 'fecha_inicio', 'fecha_fin', 'activa',
  'spend', 'impressions', 'clicks', 'conversations', 'notas',
]
const pickCampaignColumns = (obj) =>
  Object.fromEntries(CAMPAIGN_COLUMNS.filter((k) => k in obj).map((k) => [k, obj[k]]))

export async function getMarketingData() {
  if (isSupabaseConfigured) {
    try {
      const [cRes, pRes, sRes] = await Promise.all([
        supabase.from('campaigns').select(CAMPAIGN_SELECT).order('created_at', { ascending: false }),
        supabase.from('patients')
          .select('id,nombre,apellido,telefono,estado_general,fuente,campaign_id,created_at'),
        supabase.from('sessions')
          .select('id,patient_id,terapeuta_id,fecha,hora_inicio,tipo,estado,monto,pagado,campaign_id')
          .order('fecha', { ascending: true }),
      ])
      if (cRes.error) throw cRes.error
      if (pRes.error) throw pRes.error
      if (sRes.error) throw sRes.error
      return {
        source: 'live',
        campaigns: cRes.data || [],
        patients: pRes.data || [],
        sessions: sRes.data || [],
      }
    } catch (err) {
      console.warn('[efimeramente] Supabase unavailable, showing demo data:', err?.message || err)
    }
  }
  const store = getDemoStore()
  return {
    source: 'demo',
    campaigns: [],
    patients: [...store.patients],
    sessions: [...store.sessions],
  }
}

export async function createCampaign(payload) {
  const data = pickCampaignColumns(payload)
  if (!isSupabaseConfigured) return { ok: false, error: 'Solo disponible con datos en vivo.' }
  try {
    const res = await supabase.from('campaigns').insert(data).select(CAMPAIGN_SELECT).single()
    if (res.error) throw res.error
    return { ok: true, data: res.data }
  } catch (err) {
    const msg = /duplicate key|unique/i.test(err?.message || '')
      ? 'Ya existe una campaña con ese enlace (slug). Usa otro nombre.'
      : err?.message || 'No se pudo crear la campaña.'
    return { ok: false, error: msg }
  }
}

export async function updateCampaign(id, patch) {
  const data = { ...pickCampaignColumns(patch), updated_at: new Date().toISOString() }
  if (!isSupabaseConfigured) return { ok: false, error: 'Solo disponible con datos en vivo.' }
  try {
    const res = await supabase.from('campaigns').update(data).eq('id', id).select(CAMPAIGN_SELECT).single()
    if (res.error) throw res.error
    return { ok: true, data: res.data }
  } catch (err) {
    return { ok: false, error: err?.message || 'No se pudo actualizar la campaña.' }
  }
}

// CSV import: upsert the daily rows (re-imports of an updated report replace
// matching days instead of double-counting), then recompute the campaign's
// totals as the sum of ALL its daily rows and stamp them on the campaign row —
// the totals on `campaigns` are what the UI reads.
export async function importCampaignMetrics(campaignId, rows) {
  if (!isSupabaseConfigured) return { ok: false, error: 'Solo disponible con datos en vivo.' }
  try {
    const clean = rows.map((r) => ({
      campaign_id: campaignId,
      fecha: r.fecha,
      spend: Number(r.spend) || 0,
      impressions: Number(r.impressions) || 0,
      clicks: Number(r.clicks) || 0,
      conversations: Number(r.conversations) || 0,
    }))
    const up = await supabase.from('campaign_metrics').upsert(clean, { onConflict: 'campaign_id,fecha' })
    if (up.error) throw up.error

    const all = await supabase.from('campaign_metrics')
      .select('spend,impressions,clicks,conversations')
      .eq('campaign_id', campaignId)
    if (all.error) throw all.error
    const totals = (all.data || []).reduce(
      (a, m) => ({
        spend: a.spend + Number(m.spend || 0),
        impressions: a.impressions + (m.impressions || 0),
        clicks: a.clicks + (m.clicks || 0),
        conversations: a.conversations + (m.conversations || 0),
      }),
      { spend: 0, impressions: 0, clicks: 0, conversations: 0 },
    )
    return updateCampaign(campaignId, totals)
  } catch (err) {
    return { ok: false, error: err?.message || 'No se pudo importar el CSV.' }
  }
}

export async function checkFreebusy(calendarEmail, fecha, horaInicio, horaFin) {
  if (!calendarEmail) return []
  // Google freebusy needs full RFC3339 timestamps — ensure HH:MM:SS. The DB
  // returns "HH:MM:SS", but the drawer's form state holds "HH:MM" until it
  // appends seconds on save; without this, an "HH:MM" caller yields an invalid
  // timestamp, the query throws, and we'd silently report no conflicts.
  const withSeconds = (t) => (/^\d{2}:\d{2}$/.test(t) ? `${t}:00` : t)
  try {
    const timeMin = fecha + 'T' + withSeconds(horaInicio) + TZ_OFFSET
    const timeMax = fecha + 'T' + withSeconds(horaFin) + TZ_OFFSET
    const res = await fetch(CALENDAR_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'freebusy', calendarId: calendarEmail, timeMin, timeMax }),
    })
    const data = await res.json()
    return (data && data.busy) ? data.busy : []
  } catch {
    return []
  }
}
