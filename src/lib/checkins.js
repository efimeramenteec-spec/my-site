import { supabase, isSupabaseConfigured } from './supabase.js'

// Therapist side of the mirrored check-in: one tap per session.
export const THERAPIST_QUESTION = '¿Avanzaron hoy hacia donde va?'

// Same three labelled options as the patient app; stored 2 / 1 / 0.
export const CHECKIN_OPTIONS = [
  { value: 2, label: 'Sí' },
  { value: 1, label: 'Más o menos' },
  { value: 0, label: 'No mucho' },
]

// The patient's three components, for the in-room comparison.
export const PATIENT_COMPONENTS = [
  { key: 'q_bond',  label: 'Se sintió comprendido/a' },
  { key: 'q_tasks', label: 'Lo de hoy tuvo sentido' },
  { key: 'q_goals', label: 'Siente que avanzó' },
]

// Both sides of a session's check-in. RLS scopes therapists to their own
// patients, so this only ever returns data for sessions they own.
export async function getSessionCheckins(sessionId) {
  if (!isSupabaseConfigured || !sessionId) return { patient: null, therapist: null }
  const { data, error } = await supabase
    .from('session_checkins')
    .select('side, q_bond, q_tasks, q_goals, t_progress')
    .eq('session_id', sessionId)
  if (error) return { patient: null, therapist: null, error }
  return {
    patient: data?.find(r => r.side === 'patient') ?? null,
    therapist: data?.find(r => r.side === 'therapist') ?? null,
  }
}

// Upsert the therapist's answer (insert first time, update on re-tap).
export async function setTherapistCheckin(session, value) {
  if (!isSupabaseConfigured) return { demo: true }
  const { error } = await supabase
    .from('session_checkins')
    .upsert(
      { session_id: session.id, patient_id: session.patient_id, side: 'therapist', t_progress: value, source: 'app' },
      { onConflict: 'session_id,side' },
    )
  return { error }
}
