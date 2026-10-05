// src/lib/therapistRules.js
//
// Per-therapist HARD booking rules — the ONE JS source of truth (#43, 2026-10-04).
// Imported by the app (SesionDrawer + Sesiones submit, PublicBooking) AND by the
// Netlify slot/booking engine (netlify/lib/booking.mjs → computeSlots/createBooking,
// which the lead bot shares). Pure, dependency-free so esbuild can bundle it.
//
// The DB trigger enforce_therapist_rules (supabase/therapist-rules-trigger.sql) is
// the authoritative backstop and mirrors these numbers in SQL — keep both in sync.
//
// Mariana Villegas, back from maternity leave (until further notice):
//   R1 starts 10:00–20:00 inclusive, any duration (she's done by 21:00; #46, 2026-10-05)
//   R2 starts ≥ 120 min apart (1 h session + 1 h break)
//   R3 max 3 sessions per day
//   R4 en línea only
// Only non-cancelled sessions count (cancelada / legacy no_show free their slot).

export const MARIANA_ID = 'b219e764-4664-594c-9eb3-d2b19e52caac'

export const THERAPIST_RULES = {
  [MARIANA_ID]: {
    nombre: 'Mariana',
    startWindow: ['10:00', '20:00'], // earliest / latest START (end not checked)
    minStartGapMin: 120,
    maxPerDay: 3,
    onlyModalidad: 'en_linea',
  },
}

const toMin = (t) => {
  const [h, m] = String(t).slice(0, 5).split(':').map(Number)
  return h * 60 + (m || 0)
}
const isFreed = (s) => s.estado === 'cancelada' || s.estado === 'no_show'

export const rulesFor = (terapeutaId) => THERAPIST_RULES[terapeutaId] || null

/** [earliestStartMin, latestStartMin] the therapist may START in, or null (no restriction). */
export function allowedStartWindow(terapeutaId) {
  const r = rulesFor(terapeutaId)
  return r?.startWindow ? [toMin(r.startWindow[0]), toMin(r.startWindow[1])] : null
}

export const startWindowCopy = (terapeutaId) => {
  const r = rulesFor(terapeutaId)
  return r?.startWindow ? `La última sesión de ${r.nombre} empieza a las ${r.startWindow[1]}` : null
}

/** The only modalidad this therapist accepts ('en_linea'), or null. */
export const forcedModalidad = (terapeutaId) => rulesFor(terapeutaId)?.onlyModalidad || null

export const onlyModalidadCopy = (terapeutaId) => {
  const r = rulesFor(terapeutaId)
  return r?.onlyModalidad === 'en_linea' ? `${r.nombre} atiende solo en línea por ahora` : null
}

/**
 * Friendly reason the session breaks its therapist's rules, or null.
 * `session`: { id?, terapeuta_id, fecha, hora_inicio, hora_fin?, modalidad, estado? }.
 * `sameDaySessions`: any session list — filtered here to the same therapist + date,
 * non-cancelled, excluding `session.id`. A cancelled candidate never violates.
 */
export function violatesRules(session, sameDaySessions = []) {
  const r = rulesFor(session?.terapeuta_id)
  if (!r || !session.fecha || !session.hora_inicio || isFreed(session)) return null

  if (r.onlyModalidad && session.modalidad && session.modalidad !== r.onlyModalidad) {
    return `${r.nombre} atiende solo en línea por ahora`
  }
  const start = toMin(session.hora_inicio)
  if (r.startWindow) {
    const [ws, we] = r.startWindow.map(toMin)
    if (start < ws) return `La primera sesión de ${r.nombre} empieza a las ${r.startWindow[0]}`
    if (start > we) return startWindowCopy(session.terapeuta_id)
  }
  const others = sameDaySessions.filter((s) =>
    s.terapeuta_id === session.terapeuta_id && s.fecha === session.fecha &&
    !isFreed(s) && (!session.id || s.id !== session.id) && s.hora_inicio)
  if (r.maxPerDay && others.length >= r.maxPerDay) {
    return `${r.nombre} tiene máximo ${r.maxPerDay} sesiones por día`
  }
  if (r.minStartGapMin && others.some((s) => Math.abs(toMin(s.hora_inicio) - start) < r.minStartGapMin)) {
    return `${r.nombre} necesita 1 hora libre entre sesiones`
  }
  return null
}

/**
 * Should an edit be rule-checked? Mirrors the DB trigger: only when the schedule
 * (fecha, hora_inicio, hora_fin, modalidad, terapeuta_id) changes — so re-saving a
 * pre-rule session for estado/pagado/facturada is never blocked. No `prev` = insert.
 */
export function scheduleChanged(prev, next) {
  if (!prev) return true
  const hhmm = (t) => (t ? String(t).slice(0, 5) : '')
  return prev.fecha !== next.fecha ||
    hhmm(prev.hora_inicio) !== hhmm(next.hora_inicio) ||
    hhmm(prev.hora_fin) !== hhmm(next.hora_fin) ||
    prev.modalidad !== next.modalidad ||
    prev.terapeuta_id !== next.terapeuta_id
}
