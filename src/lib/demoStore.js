// Single in-memory store for demo mode, built once per session so that
// sessions created/edited in the UI persist while navigating (until reload).
// Once a Supabase anon key is set, the live path takes over and this is unused.
import { buildMockData } from './mockData.js'

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
  const row = attach(s, {
    id: 's-' + Date.now(),
    google_event_id: null,
    notas: null,
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
