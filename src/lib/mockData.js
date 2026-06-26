// Realistic demo data for when Supabase isn't configured yet.
// Everything is anchored to the CURRENT week so the Dashboard always
// looks alive regardless of the day the app is opened.
import { dateKey, weekRange, addDays, addMinutesToTime } from './format.js'
import { DURACION_MIN } from './constants.js'

const therapists = [
  { id: 't1', nombre: 'Mariana', apellido: 'Villegas', email: 'mariana@efimeramente.ec', telefono: '+593991234567', color: '#b48ae4', activo: true },
  { id: 't2', nombre: 'Daniela', apellido: 'Ríos',     email: 'daniela@efimeramente.ec', telefono: '+593987654321', color: '#f5a8a0', activo: true },
  { id: 't3', nombre: 'Andrés',  apellido: 'Soto',     email: 'andres@efimeramente.ec',  telefono: '+593999887766', color: '#faab55', activo: true },
]

// Each patient carries a fixed rate (tarifa, USD) and default payment method,
// set once at patient creation — scheduling just inherits them.
const patients = [
  { id: 'p1',  nombre: 'Valeria',   apellido: 'Mendoza',   telefono: '+593991110201', email: 'valeria.m@gmail.com',   terapeuta_id: 't1', motivo_consulta: 'Ansiedad',          estado_general: 'activo',  tarifa: 39, metodo_pago: 'transferencia' },
  { id: 'p2',  nombre: 'Diego',     apellido: 'Hernández', telefono: '+593991110202', email: 'diego.h@gmail.com',     terapeuta_id: 't1', motivo_consulta: 'Estrés laboral',    estado_general: 'activo',  tarifa: 39, metodo_pago: 'payphone' },
  { id: 'p3',  nombre: 'Sofía',     apellido: 'Ramírez',   telefono: '+593991110203', email: 'sofia.r@gmail.com',     terapeuta_id: 't1', motivo_consulta: 'Duelo',             estado_general: 'activo',  tarifa: 35, metodo_pago: 'transferencia' },
  { id: 'p4',  nombre: 'Mateo',     apellido: 'Cruz',      telefono: '+593991110204', email: 'mateo.c@gmail.com',     terapeuta_id: 't2', motivo_consulta: 'Terapia de pareja', estado_general: 'activo',  tarifa: 39, metodo_pago: 'paypal' },
  { id: 'p5',  nombre: 'Renata',    apellido: 'Flores',    telefono: '+593991110205', email: 'renata.f@gmail.com',    terapeuta_id: 't1', motivo_consulta: 'Autoestima',        estado_general: 'activo',  tarifa: 39, metodo_pago: 'transferencia' },
  { id: 'p6',  nombre: 'Emiliano',  apellido: 'Torres',    telefono: '+593991110206', email: 'emiliano.t@gmail.com',  terapeuta_id: 't3', motivo_consulta: 'Depresión',         estado_general: 'activo',  tarifa: 30, metodo_pago: 'cash' },
  { id: 'p7',  nombre: 'Camila',    apellido: 'Vega',      telefono: '+593991110207', email: 'camila.v@gmail.com',    terapeuta_id: 't3', motivo_consulta: 'Ansiedad social',   estado_general: 'activo',  tarifa: 39, metodo_pago: 'payphone' },
  { id: 'p8',  nombre: 'Santiago',  apellido: 'Luna',      telefono: '+593991110208', email: 'santiago.l@gmail.com',  terapeuta_id: 't2', motivo_consulta: 'Evaluación',        estado_general: 'activo',  tarifa: 39, metodo_pago: 'paypal' },
  { id: 'p9',  nombre: 'Ximena',    apellido: 'Castro',    telefono: '+593991110209', email: 'ximena.c@gmail.com',    terapeuta_id: 't1', motivo_consulta: 'Manejo de enojo',    estado_general: 'pausado', tarifa: 35, metodo_pago: 'cash' },
  { id: 'p10', nombre: 'Lucía',     apellido: 'Domínguez', telefono: '+593991110210', email: 'lucia.d@gmail.com',     terapeuta_id: 't2', motivo_consulta: 'Terapia familiar',  estado_general: 'alta',    tarifa: 39, metodo_pago: 'transferencia' },
]

// weekday (0 = Mon … 6 = Sun), time, patient, therapist, type, modality, base estado, paid?
const SCHEDULE = [
  [0, '09:00', 'p1', 't1', 'individual', 'presencial', 'completada', true],
  [0, '11:00', 'p5', 't1', 'individual', 'en_linea',   'completada', true],
  [0, '13:00', 'p4', 't2', 'pareja',     'presencial', 'completada', false],
  [0, '18:00', 'p7', 't3', 'individual', 'presencial', 'cancelada',  false],

  [1, '10:00', 'p2', 't1', 'individual', 'presencial', 'completada', true],
  [1, '12:00', 'p8', 't2', 'evaluacion', 'presencial', 'completada', true],
  [1, '16:00', 'p3', 't1', 'individual', 'en_linea',   'no_show',    false],
  [1, '19:00', 'p6', 't3', 'individual', 'en_linea',   'completada', false],

  [2, '09:30', 'p9', 't1', 'individual', 'presencial', 'completada', true],
  [2, '11:30', 'p10','t2', 'familia',    'presencial', 'completada', true],
  [2, '17:00', 'p1', 't1', 'individual', 'en_linea',   'completada', true],

  [3, '09:00', 'p1', 't1', 'individual', 'presencial', 'completada', true],
  [3, '11:00', 'p3', 't1', 'individual', 'en_linea',   'confirmada', false],
  [3, '12:30', 'p4', 't2', 'pareja',     'presencial', 'confirmada', false],
  [3, '15:00', 'p2', 't2', 'individual', 'presencial', 'cancelada',  false],
  [3, '17:00', 'p6', 't1', 'individual', 'presencial', 'programada', false],
  [3, '19:00', 'p7', 't3', 'individual', 'en_linea',   'programada', false],

  [4, '10:00', 'p5', 't1', 'individual', 'en_linea',   'confirmada', false],
  [4, '12:00', 'p8', 't2', 'individual', 'presencial', 'programada', false],
  [4, '16:00', 'p2', 't1', 'individual', 'presencial', 'confirmada', false],
  [4, '18:00', 'p6', 't3', 'individual', 'presencial', 'programada', false],

  [5, '09:00', 'p7', 't1', 'individual', 'presencial', 'confirmada', false],
  [5, '11:00', 'p4', 't2', 'pareja',     'presencial', 'programada', false],

  [6, '18:00', 'p3', 't1', 'individual', 'en_linea',   'programada', false],
]

const NEXT_WEEK = [
  [7, '09:00', 'p1', 't1', 'individual', 'presencial', 'programada', false],
  [8, '10:00', 'p5', 't1', 'individual', 'en_linea',   'confirmada', false],
]

// Keep estados coherent regardless of which weekday the app is opened.
// Confirmation model: pendiente (programada) / confirmada / cancelada.
function reconcile(fecha, base, todayKey) {
  if (base === 'cancelada' || base === 'no_show') return 'cancelada'
  if (fecha < todayKey) return 'confirmada' // already happened
  return base === 'completada' ? 'confirmada' : base
}

export function buildMockData(now = new Date()) {
  const { monday } = weekRange(now)
  const todayKey = dateKey(now)

  const rows = [...SCHEDULE, ...NEXT_WEEK]
  const sessions = rows.map((r, i) => {
    const [wd, time, patientId, terapeutaId, tipo, modalidad, base] = r
    const paidFlag = r[7]
    const patient = patients.find((p) => p.id === patientId)
    const fecha = dateKey(addDays(monday, wd))
    const estado = reconcile(fecha, base, todayKey)
    const pagado = estado !== 'cancelada' && fecha < todayKey ? !!paidFlag : false
    return {
      id: `s${i + 1}`,
      patient_id: patientId,
      terapeuta_id: terapeutaId,
      fecha,
      hora_inicio: `${time}:00`,
      hora_fin: `${addMinutesToTime(time, DURACION_MIN[tipo] || 75)}:00`,
      tipo,
      modalidad,
      estado,
      monto: patient?.tarifa ?? 39,
      pagado,
      metodo_pago: patient?.metodo_pago || 'transferencia',
      notas: null,
      google_event_id: null,
      patient,
      therapist: therapists.find((t) => t.id === terapeutaId),
    }
  })

  // WhatsApp log — reminders + patient replies for confirmed / cancelled sessions.
  const whatsapp_messages = []
  let wid = 0
  for (const s of sessions) {
    if (s.fecha < todayKey) continue
    if (!['confirmada', 'cancelada', 'programada'].includes(s.estado)) continue
    whatsapp_messages.push({
      id: `w${++wid}`, session_id: s.id, patient_id: s.patient_id, twilio_sid: `SM${wid}demo`,
      direccion: 'saliente', cuerpo: `Hola ${s.patient.nombre}, te recordamos tu cita el ${s.fecha}. Responde Sí para confirmar.`,
      estado_entrega: 'entregado', respuesta_cita: null, received_at: `${s.fecha}T08:00:00`,
    })
    if (s.estado === 'confirmada' || s.estado === 'cancelada') {
      whatsapp_messages.push({
        id: `w${++wid}`, session_id: s.id, patient_id: s.patient_id, twilio_sid: `SM${wid}demo`,
        direccion: 'entrante', cuerpo: s.estado === 'confirmada' ? 'Sí, ahí estaré 🙂' : 'No podré asistir',
        estado_entrega: 'recibido', respuesta_cita: s.estado === 'confirmada' ? 'confirmada' : 'cancelada',
        received_at: `${s.fecha}T08:12:00`,
      })
    }
  }

  // Financial ledger — income from paid sessions + a couple of expenses.
  const facturas = sessions
    .filter((s) => s.pagado)
    .map((s, i) => ({
      id: `f${i + 1}`, session_id: s.id, patient_id: s.patient_id,
      concepto: `Sesión ${s.tipo} — ${s.patient.nombre} ${s.patient.apellido}`,
      monto: s.monto, tipo: 'ingreso', metodo_pago: s.metodo_pago, fecha: s.fecha, notas: null,
    }))
  facturas.push(
    { id: 'fx1', session_id: null, patient_id: null, concepto: 'Renta del consultorio', monto: 350, tipo: 'egreso', metodo_pago: 'transferencia', fecha: dateKey(addDays(monday, 0)), notas: 'Mensual' },
    { id: 'fx2', session_id: null, patient_id: null, concepto: 'Suscripción software', monto: 30, tipo: 'egreso', metodo_pago: 'paypal', fecha: dateKey(addDays(monday, 2)), notas: null },
  )

  return { therapists, patients, sessions, whatsapp_messages, facturas }
}
