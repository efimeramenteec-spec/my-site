// Adherence math for the Seguimiento module. Pure functions, no I/O.
//
// Definition (Nicolas, 2026-07-04): each patient has an expected cadence
// (patients.frecuencia): semanal ⇒ 4 sesiones/mes, quincenal ⇒ 2/mes.
// Attendance rate is HISTORIC — every attended session (estado confirmada)
// against the total expected since their first attended session. The quota is
// fixed per calendar month, so a weekly patient attending all 5 weeks of a
// 5-week month scores above 100% — that is intended and allowed.
import { toDate, dateKey } from './format.js'

export const FRECUENCIA_QUOTA = { semanal: 4, quincenal: 2 }

// A session that actually happened: confirmed (completada = legacy synonym),
// a real therapy session (never the free 10-min llamada), already in the past.
export function isAttended(s, todayKey) {
  return (
    (s.estado === 'confirmada' || s.estado === 'completada') &&
    s.tipo !== 'llamada' &&
    s.fecha <= todayKey
  )
}

// Any real session on the calendar from today on — used to exempt a patient
// from the "en riesgo" list (they already have a next appointment).
export function hasUpcoming(sessions, todayKey) {
  return sessions.some(
    (s) =>
      s.fecha >= todayKey &&
      s.tipo !== 'llamada' &&
      s.estado !== 'cancelada' &&
      s.estado !== 'no_show',
  )
}

// Expected sessions between two 'YYYY-MM-DD' keys (inclusive) at a fixed
// monthly quota. Partial first/last months prorate by day coverage, so the
// window "Jun 1 → Jun 30" at quota 4 expects exactly 4 — matching the
// intuition "semanal = 4 por mes" regardless of the month's week count.
export function expectedSessions(fromKey, toKey, quotaPerMonth) {
  const from = toDate(fromKey)
  const to = toDate(toKey)
  if (to < from) return 0
  let total = 0
  let cursor = new Date(from.getFullYear(), from.getMonth(), 1)
  while (cursor <= to) {
    const y = cursor.getFullYear()
    const m = cursor.getMonth()
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const startDay = y === from.getFullYear() && m === from.getMonth() ? from.getDate() : 1
    const endDay = y === to.getFullYear() && m === to.getMonth() ? to.getDate() : daysInMonth
    total += (quotaPerMonth * (endDay - startDay + 1)) / daysInMonth
    cursor = new Date(y, m + 1, 1)
  }
  return total
}

// Historic adherence for one patient given THEIR sessions (any order).
// Returns null when the patient has no frecuencia. `rate` is null until the
// patient has at least one attended session (no window to measure yet).
export function adherence(patient, sessions, todayKey = dateKey()) {
  const quota = FRECUENCIA_QUOTA[patient.frecuencia]
  if (!quota) return null
  const attended = sessions.filter((s) => isAttended(s, todayKey))
  if (attended.length === 0) {
    return { asistidas: 0, esperadas: 0, rate: null, desde: null }
  }
  const desde = attended.reduce((min, s) => (s.fecha < min ? s.fecha : min), attended[0].fecha)
  // Floor of 1: a patient whose window opened days ago has "1 expected so
  // far" at most — without it, a first session today would divide by ~0.
  const esperadas = Math.max(1, expectedSessions(desde, todayKey, quota))
  return { asistidas: attended.length, esperadas, rate: attended.length / esperadas, desde }
}
