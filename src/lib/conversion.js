// Llamada (free 10-min intro call) conversion — #3 (2026-08-31).
//
// A llamada "converts" when that same patient later books a REAL session (any
// non-llamada, non-cancelled) dated AFTER the call. This is derived LIVE (no
// cron): it can never drift and is always current. A manual override lives in
// sessions.convirtio — NULL means "auto-derive", true/false means a therapist
// or owner set it by hand and the override wins.

const isCancelled = (estado) => estado === 'cancelada' || estado === 'no_show'

// Auto-derived conversion for a llamada, given all sessions of its patient.
export function llamadaConvertedAuto(llamada, patientSessions = []) {
  if (!llamada || llamada.tipo !== 'llamada') return false
  return patientSessions.some(
    (s) => s.tipo !== 'llamada' && !isCancelled(s.estado) && s.fecha > llamada.fecha,
  )
}

// Effective conversion = manual override when set, otherwise the live auto value.
export function llamadaConverted(llamada, patientSessions = []) {
  if (llamada && llamada.convirtio != null) return llamada.convirtio
  return llamadaConvertedAuto(llamada, patientSessions)
}

// Group a flat session list by patient_id (helper for the page).
export function groupSessionsByPatient(sessions = []) {
  const map = {}
  for (const s of sessions) (map[s.patient_id] ||= []).push(s)
  return map
}
