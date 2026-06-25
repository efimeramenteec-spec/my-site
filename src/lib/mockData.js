// Realistic demo data for when Supabase isn't configured yet.
// Everything is anchored to the CURRENT week so the Dashboard always
// looks alive regardless of the day the app is opened.
import { dateKey, weekRange, addDays } from './format.js'

const PRECIO = {
  individual: 1000,
  pareja: 1400,
  familia: 1500,
  grupo: 600,
  evaluacion: 1800,
}

const METODOS = ['efectivo', 'transferencia', 'tarjeta']

const therapists = [
  { id: 't1', nombre: 'Mariana', apellido: 'Villegas', email: 'mariana@efimeramente.mx', telefono: '+5215512345678', color: '#b48ae4', activo: true },
  { id: 't2', nombre: 'Daniela', apellido: 'Ríos',     email: 'daniela@efimeramente.mx', telefono: '+5215587654321', color: '#f5a8a0', activo: true },
  { id: 't3', nombre: 'Andrés',  apellido: 'Soto',     email: 'andres@efimeramente.mx',  telefono: '+5215599887766', color: '#faab55', activo: true },
]

const patients = [
  { id: 'p1',  nombre: 'Valeria',   apellido: 'Mendoza',   telefono: '+5215511112201', email: 'valeria.m@gmail.com',   terapeuta_id: 't1', motivo_consulta: 'Ansiedad',          estado_general: 'activo'  },
  { id: 'p2',  nombre: 'Diego',     apellido: 'Hernández', telefono: '+5215511112202', email: 'diego.h@gmail.com',     terapeuta_id: 't1', motivo_consulta: 'Estrés laboral',    estado_general: 'activo'  },
  { id: 'p3',  nombre: 'Sofía',     apellido: 'Ramírez',   telefono: '+5215511112203', email: 'sofia.r@gmail.com',     terapeuta_id: 't1', motivo_consulta: 'Duelo',             estado_general: 'activo'  },
  { id: 'p4',  nombre: 'Mateo',     apellido: 'Cruz',      telefono: '+5215511112204', email: 'mateo.c@gmail.com',     terapeuta_id: 't2', motivo_consulta: 'Terapia de pareja', estado_general: 'activo'  },
  { id: 'p5',  nombre: 'Renata',    apellido: 'Flores',    telefono: '+5215511112205', email: 'renata.f@gmail.com',    terapeuta_id: 't1', motivo_consulta: 'Autoestima',        estado_general: 'activo'  },
  { id: 'p6',  nombre: 'Emiliano',  apellido: 'Torres',    telefono: '+5215511112206', email: 'emiliano.t@gmail.com',  terapeuta_id: 't3', motivo_consulta: 'Depresión',         estado_general: 'activo'  },
  { id: 'p7',  nombre: 'Camila',    apellido: 'Vega',      telefono: '+5215511112207', email: 'camila.v@gmail.com',    terapeuta_id: 't3', motivo_consulta: 'Ansiedad social',   estado_general: 'activo'  },
  { id: 'p8',  nombre: 'Santiago',  apellido: 'Luna',      telefono: '+5215511112208', email: 'santiago.l@gmail.com',  terapeuta_id: 't2', motivo_consulta: 'Evaluación',        estado_general: 'activo'  },
  { id: 'p9',  nombre: 'Ximena',    apellido: 'Castro',    telefono: '+5215511112209', email: 'ximena.c@gmail.com',    terapeuta_id: 't1', motivo_consulta: 'Manejo de enojo',    estado_general: 'pausado' },
  { id: 'p10', nombre: 'Lucía',     apellido: 'Domínguez', telefono: '+5215511112210', email: 'lucia.d@gmail.com',     terapeuta_id: 't2', motivo_consulta: 'Terapia familiar',  estado_general: 'alta'    },
]

// weekday (0 = Mon … 6 = Sun), time, duration, patient, therapist, type, modality, base estado, paid?
const SCHEDULE = [
  [0, '09:00', 50, 'p1', 't1', 'individual', 'presencial', 'completada', true],
  [0, '11:00', 50, 'p5', 't1', 'individual', 'en_linea',   'completada', true],
  [0, '13:00', 60, 'p4', 't2', 'pareja',     'presencial', 'completada', false],
  [0, '18:00', 50, 'p7', 't3', 'individual', 'presencial', 'cancelada',  false],

  [1, '10:00', 50, 'p2', 't1', 'individual', 'presencial', 'completada', true],
  [1, '12:00', 90, 'p8', 't2', 'evaluacion', 'presencial', 'completada', true],
  [1, '16:00', 50, 'p3', 't1', 'individual', 'en_linea',   'no_show',    false],
  [1, '19:00', 50, 'p6', 't3', 'individual', 'en_linea',   'completada', false],

  [2, '09:30', 50, 'p9', 't1', 'individual', 'presencial', 'completada', true],
  [2, '11:30', 60, 'p10','t2', 'familia',    'presencial', 'completada', true],
  [2, '17:00', 50, 'p1', 't1', 'individual', 'en_linea',   'completada', true],

  [3, '09:00', 50, 'p1', 't1', 'individual', 'presencial', 'completada', true],
  [3, '11:00', 50, 'p3', 't1', 'individual', 'en_linea',   'confirmada', false],
  [3, '12:30', 60, 'p4', 't2', 'pareja',     'presencial', 'confirmada', false],
  [3, '15:00', 50, 'p2', 't2', 'individual', 'presencial', 'cancelada',  false],
  [3, '17:00', 50, 'p6', 't1', 'individual', 'presencial', 'programada', false],
  [3, '19:00', 50, 'p7', 't3', 'individual', 'en_linea',   'programada', false],

  [4, '10:00', 50, 'p5', 't1', 'individual', 'en_linea',   'confirmada', false],
  [4, '12:00', 50, 'p8', 't2', 'individual', 'presencial', 'programada', false],
  [4, '16:00', 90, 'p2', 't1', 'evaluacion', 'presencial', 'confirmada', false],
  [4, '18:00', 50, 'p6', 't3', 'individual', 'presencial', 'programada', false],

  [5, '09:00', 50, 'p7', 't1', 'individual', 'presencial', 'confirmada', false],
  [5, '11:00', 60, 'p4', 't2', 'pareja',     'presencial', 'programada', false],

  [6, '18:00', 50, 'p3', 't1', 'individual', 'en_linea',   'programada', false],
]

// A couple of next-week sessions so the "upcoming" list always extends ahead.
const NEXT_WEEK = [
  [7,  '09:00', 50, 'p1', 't1', 'individual', 'presencial', 'programada', false],
  [8,  '10:00', 50, 'p5', 't1', 'individual', 'en_linea',   'confirmada', false],
]

function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + mins
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

// Keep estados coherent no matter what weekday the app is opened.
function reconcile(fecha, base, todayKey) {
  if (base === 'cancelada' || base === 'no_show') return base
  if (fecha < todayKey) return 'completada'
  if (fecha > todayKey) return base === 'completada' ? 'confirmada' : base
  return base
}

export function buildMockData(now = new Date()) {
  const { monday } = weekRange(now)
  const todayKey = dateKey(now)

  const rows = [...SCHEDULE, ...NEXT_WEEK]
  const sessions = rows.map((r, i) => {
    const [wd, time, dur, patientId, terapeutaId, tipo, modalidad, base, paid] = r
    const fecha = dateKey(addDays(monday, wd))
    const estado = reconcile(fecha, base, todayKey)
    const completed = estado === 'completada'
    const pagado = completed ? paid : false
    const metodo_pago = pagado ? METODOS[i % METODOS.length] : 'pendiente'
    return {
      id: `s${i + 1}`,
      patient_id: patientId,
      terapeuta_id: terapeutaId,
      fecha,
      hora_inicio: `${time}:00`,
      hora_fin: `${addMinutes(time, dur)}:00`,
      tipo,
      modalidad,
      estado,
      monto: PRECIO[tipo],
      pagado,
      metodo_pago,
      notas: null,
      google_event_id: null,
      patient: patients.find((p) => p.id === patientId),
      therapist: therapists.find((t) => t.id === terapeutaId),
    }
  })

  // WhatsApp log — reminders + patient replies for confirmed / cancelled sessions.
  const whatsapp_messages = []
  let wid = 0
  for (const s of sessions) {
    if (!['confirmada', 'cancelada', 'programada'].includes(s.estado)) continue
    if (s.fecha < todayKey) continue
    // outbound reminder
    whatsapp_messages.push({
      id: `w${++wid}`,
      session_id: s.id,
      patient_id: s.patient_id,
      twilio_sid: `SM${wid}demo`,
      direccion: 'saliente',
      cuerpo: `Hola ${s.patient.nombre}, te recordamos tu cita el ${s.fecha}. Responde Sí para confirmar.`,
      estado_entrega: 'entregado',
      respuesta_cita: null,
      received_at: `${s.fecha}T08:00:00`,
    })
    // inbound reply only for resolved ones
    if (s.estado === 'confirmada' || s.estado === 'cancelada') {
      whatsapp_messages.push({
        id: `w${++wid}`,
        session_id: s.id,
        patient_id: s.patient_id,
        twilio_sid: `SM${wid}demo`,
        direccion: 'entrante',
        cuerpo: s.estado === 'confirmada' ? 'Sí, ahí estaré 🙂' : 'No podré asistir, lo siento',
        estado_entrega: 'recibido',
        respuesta_cita: s.estado === 'confirmada' ? 'confirmada' : 'cancelada',
        received_at: `${s.fecha}T08:12:00`,
      })
    }
  }

  // Financial ledger — income from paid sessions + a couple of expenses.
  const facturas = sessions
    .filter((s) => s.pagado)
    .map((s, i) => ({
      id: `f${i + 1}`,
      session_id: s.id,
      patient_id: s.patient_id,
      concepto: `Sesión ${s.tipo} — ${s.patient.nombre} ${s.patient.apellido}`,
      monto: s.monto,
      tipo: 'ingreso',
      metodo_pago: s.metodo_pago,
      fecha: s.fecha,
      notas: null,
    }))

  facturas.push(
    { id: 'fx1', session_id: null, patient_id: null, concepto: 'Renta del consultorio', monto: 8000, tipo: 'egreso', metodo_pago: 'transferencia', fecha: dateKey(addDays(monday, 0)), notas: 'Mensual' },
    { id: 'fx2', session_id: null, patient_id: null, concepto: 'Suscripción software', monto: 600, tipo: 'egreso', metodo_pago: 'tarjeta', fecha: dateKey(addDays(monday, 2)), notas: null },
  )

  return { therapists, patients, sessions, whatsapp_messages, facturas }
}
