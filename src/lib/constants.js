// Single source of truth for enum → label + Badge variant mappings.
// Keeps every screen consistent and powers the poka-yoke dropdowns.

// sessions.estado — confirmation state. Three states are used going forward;
// legacy values (completada/no_show) are mapped for safe display of old rows.
export const ESTADO_SESION = {
  programada: { label: 'Pendiente',  badge: 'yellow' },
  confirmada: { label: 'Confirmada', badge: 'lavender' },
  cancelada:  { label: 'Cancelada',  badge: 'pink' },
  completada: { label: 'Confirmada', badge: 'lavender' }, // legacy → treat as confirmed
  no_show:    { label: 'Cancelada',  badge: 'pink' },      // legacy → treat as cancelled
}

// The confirmation states a user can set, in display order.
export const CONFIRMACION = [
  { value: 'programada', short: 'Pend.',  label: 'Pendiente',  color: '#ffd84a' },
  { value: 'confirmada', short: 'Conf.',  label: 'Confirmada', color: '#b48ae4' },
  { value: 'cancelada',  short: 'Canc.',  label: 'Cancelada',  color: '#f5a8a0' },
]

// sessions.tipo — full map (for display of any record).
export const TIPO_SESION = {
  individual: 'Individual',
  pareja:     'Pareja',
  familia:    'Familia',
  grupo:      'Grupo',
  evaluacion: 'Evaluación',
  llamada:    'Llamada',
}

// Types offered in the scheduling form (simplified per practice).
export const TIPO_FORM = {
  individual: 'Individual',
  pareja:     'Pareja',
  llamada:    'Llamada (10 min)',
}

// Session duration in minutes, including a 15-min buffer for overruns.
// Exception: llamada is the free intro call — exactly 10 min, no buffer.
export const DURACION_MIN = {
  individual: 60,
  pareja:     105,
  familia:    75,
  grupo:      75,
  evaluacion: 75,
  llamada:    10,
}

// sessions.modalidad
export const MODALIDAD = {
  presencial: 'Presencial',
  en_linea:   'En línea',
}

// patients.tipo_paciente (#1, 2026-08-31). Pareja/Menor carry a second person
// (nombre_2/apellido_2). See patientLabel() in format.js for the display name.
export const TIPO_PACIENTE = {
  individual: 'Individual',
  pareja:     'Pareja',
  menor:      'Menor de edad',
}

// Payment methods — exactly three (Nicolas, 2026-08-31). Recorded on the session
// when it's marked paid (picker in Sesiones → Lista) and defaulted per patient.
export const METODO_PAGO = {
  transferencia: 'Transferencia',
  paypal:        'PayPal',
  payphone:      'PayPhone',
}
// Order for the pay picker in Lista.
export const METODO_PAGO_ORDER = ['transferencia', 'paypal', 'payphone']

// patients.estado_general — simplified 2026-08-31 (C2) to just two states; the
// old "descontinuado" was redundant/unclear vs "inactivo" and was merged into
// it (migrate-descontinuado-to-inactivo.sql). activo = expected to keep coming
// (default). inactivo = not currently coming (may or may not return). Only
// ACTIVO patients are tracked in Seguimiento (adherence / en riesgo). Display
// code falls back gracefully for any legacy value.
export const ESTADO_PACIENTE = {
  activo:   { label: 'Activo',   badge: 'lavender' },
  inactivo: { label: 'Inactivo', badge: 'yellow' },
}

// whatsapp_messages.respuesta_cita
export const RESPUESTA_CITA = {
  confirmada:  { label: 'Confirmada',  badge: 'lavender' },
  cancelada:   { label: 'Cancelada',   badge: 'pink' },
  reprogramar: { label: 'Reprogramar', badge: 'orange' },
}

// patients.fuente removed from the app 2026-09-04 — attribution is fully
// automatic (date-based) now, so the manual source field was obsolete. The DB
// column is left dormant. Consequence: referrals are no longer excluded from
// campaign attribution (accepted by Nicolas).

// patients.frecuencia — expected therapy cadence (Seguimiento module).
// NULL/unset patients are excluded from the adherence metric.
export const FRECUENCIA_PACIENTE = {
  semanal:   'Semanal',
  quincenal: 'Quincenal',
}

// Default per-session rate (USD) when a patient has none set.
export const TARIFA_DEFAULT = 39

// Build <Select> options from a label map.
export const toOptions = (map) =>
  Object.entries(map).map(([value, v]) => ({
    value,
    label: typeof v === 'string' ? v : v.label,
  }))
