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
