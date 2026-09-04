// In-app double-booking prevention (Step A of the calendar work).
// Works off our own sessions data — no Google needed yet.
import { DURACION_MIN } from './constants.js'
import { addMinutesToTime } from './format.js'

const toMin = (hhmm) => {
  const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number)
  return h * 60 + (m || 0)
}

/** [startMin, endMin) for a session — uses stored hora_fin, else derives from type. */
export function sessionInterval(s) {
  const start = toMin(s.hora_inicio)
  const end = s.hora_fin
    ? toMin(s.hora_fin)
    : toMin(addMinutesToTime(String(s.hora_inicio).slice(0, 5), DURACION_MIN[s.tipo] || 75))
  return [start, end]
}

/**
 * Returns the first existing session that clashes with `candidate`
 * (same therapist + date, overlapping time block, not cancelled),
 * or null. Back-to-back slots do NOT clash. `excludeId` skips the
 * session being edited.
 */
export function findConflict(sessions = [], candidate, excludeId = null) {
  if (!candidate?.terapeuta_id || !candidate?.fecha || !candidate?.hora_inicio) return null
  const [cs, ce] = sessionInterval(candidate)
  return (
    sessions.find((s) => {
      if (s.id === excludeId) return false
      if (s.terapeuta_id !== candidate.terapeuta_id) return false
      if (s.fecha !== candidate.fecha) return false
      if (s.estado === 'cancelada' || s.estado === 'no_show') return false
      const [ss, se] = sessionInterval(s)
      return cs < se && ss < ce
    }) || null
  )
}

// The practice has 3 physical offices, so at most 3 PRESENCIAL sessions can
// happen at once (across ALL therapists). En línea sessions need no room.
export const CONSULTORIOS = 3

/**
 * How many non-cancelled PRESENCIAL sessions (all therapists) overlap the
 * candidate's time window. Only meaningful for a presencial candidate; returns
 * 0 otherwise. `excludeId` skips the session being edited.
 */
export function presencialOverlapCount(sessions = [], candidate, excludeId = null) {
  if (candidate?.modalidad !== 'presencial' || !candidate?.fecha || !candidate?.hora_inicio) return 0
  const [cs, ce] = sessionInterval(candidate)
  let count = 0
  for (const s of sessions) {
    if (s.id === excludeId) continue
    if (s.modalidad !== 'presencial') continue
    if (s.fecha !== candidate.fecha) continue
    if (s.estado === 'cancelada' || s.estado === 'no_show') continue
    const [ss, se] = sessionInterval(s)
    if (cs < se && ss < ce) count++
  }
  return count
}

/** True when a new presencial session has no free office in its window. */
export function roomsFull(sessions = [], candidate, excludeId = null) {
  return presencialOverlapCount(sessions, candidate, excludeId) >= CONSULTORIOS
}
