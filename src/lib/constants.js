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

// Payment methods (set per patient at creation, recorded on the session).
export const METODO_PAGO = {
  transferencia: 'Transferencia',
  payphone:      'PayPhone',
  paypal:        'PayPal',
  cash:          'Cash',
}

// patients.estado_general — redefined 2026-07-04 (was activo/pausado/alta/baja).
// activo = expected to keep coming (default). inactivo = hasn't come back but
// might. descontinuado = gone or explicitly quit. Only ACTIVO patients are
// tracked in Seguimiento (adherence / en riesgo). Legacy values were migrated
// in the DB (patient-estado-overhaul.sql); display code falls back gracefully.
export const ESTADO_PACIENTE = {
  activo:        { label: 'Activo',        badge: 'lavender' },
  inactivo:      { label: 'Inactivo',      badge: 'yellow' },
  descontinuado: { label: 'Descontinuado', badge: 'neutral' },
}

// whatsapp_messages.respuesta_cita
export const RESPUESTA_CITA = {
  confirmada:  { label: 'Confirmada',  badge: 'lavender' },
  cancelada:   { label: 'Cancelada',   badge: 'pink' },
  reprogramar: { label: 'Reprogramar', badge: 'orange' },
}

// patients.fuente — acquisition source (Marketing module). 'ads' is stamped
// automatically by public-booking when a booking arrives via /agendar?c=<slug>.
export const FUENTE_PACIENTE = {
  ads:      'Campaña (ads)',
  referido: 'Referido',
  organico: 'Orgánico',
  otro:     'Otro',
}

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
