// Single in-memory store for demo mode, built once per session so that
// sessions created/edited in the UI persist while navigating (until reload).
// Once a Supabase anon key is set, the live path takes over and this is unused.
import { buildMockData } from './mockData.js'
import { addMinutesToTime } from './format.js'
import { DURACION_MIN, TARIFA_DEFAULT } from './constants.js'

let store = null

export function getDemoStore() {
  if (!store) store = buildMockData(new Date())
  return store
}

function attach(s, row) {
  return {
    ...row,
    patient: s.patients.find((p) => p.id === row.patient_id) || null,
    therapist: s.therapists.find((t) => t.id === row.terapeuta_id) || null,
  }
}

export function demoCreateSession(payload) {
  const s = getDemoStore()
  const patient = s.patients.find((p) => p.id === payload.patient_id)
  const start = (payload.hora_inicio || '10:00:00').slice(0, 5)
  const row = attach(s, {
    id: 's-' + Date.now(),
    google_event_id: null,
    notas: null,
    estado: 'programada',
    pagado: false,
    monto: patient?.tarifa ?? TARIFA_DEFAULT,
    metodo_pago: patient?.metodo_pago || 'transferencia',
    hora_fin: `${addMinutesToTime(start, DURACION_MIN[payload.tipo] || 75)}:00`,
    ...payload,
  })
  s.sessions.push(row)
  return row
}

export function demoUpdateSession(id, patch) {
  const s = getDemoStore()
  const i = s.sessions.findIndex((x) => x.id === id)
  if (i === -1) return null
  s.sessions[i] = attach(s, { ...s.sessions[i], ...patch })
  return s.sessions[i]
}

// ─── Pacientes demo mutations ────────────────────────────────────

export function demoCreatePatient(payload) {
  const s = getDemoStore()
  const row = {
    id: 'p-' + Date.now(),
    estado_general: 'activo',
    tarifa: TARIFA_DEFAULT,
    metodo_pago: 'transferencia',
    email: null,
    motivo_consulta: null,
    ...payload,
  }
  s.patients.push(row)
  return row
}

export function demoUpdatePatient(id, patch) {
  const s = getDemoStore()
  const i = s.patients.findIndex((x) => x.id === id)
  if (i === -1) return null
  s.patients[i] = { ...s.patients[i], ...patch }
  return s.patients[i]
}
