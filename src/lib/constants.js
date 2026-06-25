// Single source of truth for enum → label + Badge variant mappings.
// Keeps every screen consistent and powers the poka-yoke dropdowns.

// sessions.estado
export const ESTADO_SESION = {
  programada: { label: 'Programada', badge: 'yellow' },
  confirmada: { label: 'Confirmada', badge: 'lavender' },
  completada: { label: 'Completada', badge: 'neutral' },
  cancelada:  { label: 'Cancelada',  badge: 'pink' },
  no_show:    { label: 'No asistió', badge: 'pink' },
}

// sessions.tipo
export const TIPO_SESION = {
  individual: 'Individual',
  pareja:     'Pareja',
  familia:    'Familia',
  grupo:      'Grupo',
  evaluacion: 'Evaluación',
}

// sessions.modalidad
export const MODALIDAD = {
  presencial: 'Presencial',
  en_linea:   'En línea',
}

// sessions.metodo_pago / facturas.metodo_pago
export const METODO_PAGO = {
  efectivo:      'Efectivo',
  transferencia: 'Transferencia',
  tarjeta:       'Tarjeta',
  pendiente:     'Pendiente',
}

// patients.estado_general
export const ESTADO_PACIENTE = {
  activo:  { label: 'Activo',  badge: 'lavender' },
  pausado: { label: 'Pausado', badge: 'yellow' },
  alta:    { label: 'Alta',    badge: 'neutral' },
  baja:    { label: 'Baja',    badge: 'neutral' },
}

// whatsapp_messages.respuesta_cita
export const RESPUESTA_CITA = {
  confirmada:  { label: 'Confirmada',  badge: 'lavender' },
  cancelada:   { label: 'Cancelada',   badge: 'pink' },
  reprogramar: { label: 'Reprogramar', badge: 'orange' },
}

// Helper to build <Select> options from a label map.
export const toOptions = (map) =>
  Object.entries(map).map(([value, v]) => ({
    value,
    label: typeof v === 'string' ? v : v.label,
  }))
