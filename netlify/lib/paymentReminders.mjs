// netlify/lib/paymentReminders.mjs
//
// Core of the payment-reminder protocol (spec #8). Pure-ish: takes a supabase admin
// client + options, returns a structured report. Shared by the scheduled sender
// (send-payment-reminders.mjs) and the guarded manual trigger (payment-run.mjs).
//
// RULE (America/Guayaquil, no DST):
//   • Runs Mon–Sat (never Sunday) — the caller's cron is Mon–Sat; this also guards it.
//   • Eligible session: estado='confirmada' AND tipo<>'llamada' AND pagado=false AND
//     fecha <= today-2 AND recordatorio_pago_at IS NULL AND pago_excluido=false.
//   • ONE message per patient, covering all their newly-eligible sessions. Every
//     included session is stamped recordatorio_pago_at so it's reminded exactly once.
//   • Never insists: if a patient has ANY session already reminded and still unpaid
//     (= "en mora"), skip them entirely — Nicolás handles those personally.
//   • Amount = sum of the included sessions' monto. (Saldo-a-favor netting [#19] is TODO.)
//   • Recipient = patients.telefono, ALWAYS (Option A, 2026-09-25): the number saved on
//     the patient is who we message. No payer routing — payer_id is invoicing-only. For a
//     minor (tipo_paciente='menor') that saved number is the tutor's, so we greet the
//     tutor (person 1 = nombre) and NAME the minor (nombre_2) in {{3}} — "la sesión de
//     Camila del …" — so a parent who pays for both themselves and their child can tell
//     which session each message is about.

import { sendDualhookPaymentReminder, normalizePhone } from './whatsapp.mjs'

const GYE_OFFSET_H = -5 // Ecuador, no DST
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// A Date → { dateStr:'YYYY-MM-DD', dow:0..6 } in Guayaquil local time.
function gyeParts(now) {
  const g = new Date(now.getTime() + GYE_OFFSET_H * 3600e3)
  return { dateStr: g.toISOString().slice(0, 10), dow: g.getUTCDay() }
}

function addDaysStr(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return dt.toISOString().slice(0, 10)
}

// "39.00" → "39", "39.50" → "39.50"
function fmtMonto(n) {
  const v = Number(n)
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

function dm(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number)
  return { d, mes: MESES[m - 1] || '' }
}

const joinList = (items) => {
  if (items.length <= 1) return items[0] || ''
  if (items.length === 2) return `${items[0]} y ${items[1]}`
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

// Date fragment for a set of session dates: "22 de septiembre",
// "20 y 22 de septiembre", "30 de septiembre y 2 de octubre".
function fechasFragment(fechas) {
  const parts = [...new Set(fechas)].sort().map(dm)
  const sameMonth = parts.every((p) => p.mes === parts[0].mes)
  if (parts.length === 1) return `${parts[0].d} de ${parts[0].mes}`
  if (sameMonth) return `${joinList(parts.map((p) => String(p.d)))} de ${parts[0].mes}`
  return joinList(parts.map((p) => `${p.d} de ${p.mes}`))
}

// Self-pay {{3}} (addressed to the patient): "tu sesión del …" / "tus sesiones del …".
export function buildSesionesText(fechas) {
  const n = new Set(fechas).size
  return `${n === 1 ? 'tu sesión' : 'tus sesiones'} del ${fechasFragment(fechas)}`
}

// Minor {{3}} (message goes to the tutor at the patient's saved phone; {{1}} is the
// tutor). Names the child so tutor and practice both know which session is charged:
//   "la sesión de Camila del 23 de septiembre" / "las sesiones de Camila del 20 y 22 …"
export function buildMinorSesionesText(minorNombre, fechas) {
  const n = new Set(fechas).size
  const who = String(minorNombre || '').trim().split(/\s+/)[0] || 'tu paciente'
  return `${n === 1 ? 'la sesión' : 'las sesiones'} de ${who} del ${fechasFragment(fechas)}`
}

function firstName(nombre) {
  return String(nombre || '').trim().split(/\s+/)[0] || 'paciente'
}

// Run the protocol. Options: { now, live, dryRun }.
//   • dryRun (or !live): compute the plan, send NOTHING, mark NOTHING.
//   • live: send + stamp recordatorio_pago_at on each included session.
// Never throws mid-batch on a single bad send — one patient can't crash the run.
export async function runPaymentReminders(supabase, { now = new Date(), live = false, dryRun = false } = {}) {
  const { dateStr: today, dow } = gyeParts(now)
  if (dow === 0) return { skippedSunday: true, today, sent: 0, failed: 0, skipped: 0, patients: [] }
  const cutoff = addDaysStr(today, -2)

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, fecha, monto, patient_id, patient:patients(nombre, apellido, nombre_2, tipo_paciente, telefono)')
    .eq('estado', 'confirmada')
    .neq('tipo', 'llamada')
    .eq('pagado', false)
    .is('recordatorio_pago_at', null)
    .eq('pago_excluido', false)
    .lte('fecha', cutoff)
  if (error) throw new Error('eligible query: ' + error.message)

  // "En mora": any patient with a reminded-and-still-unpaid session is skipped whole.
  const { data: mora, error: mErr } = await supabase
    .from('sessions').select('patient_id')
    .not('recordatorio_pago_at', 'is', null).eq('pagado', false)
  if (mErr) throw new Error('mora query: ' + mErr.message)
  const moraSet = new Set((mora || []).map((r) => r.patient_id))

  const byPatient = new Map()
  for (const s of sessions || []) {
    if (moraSet.has(s.patient_id)) continue
    if (!byPatient.has(s.patient_id)) byPatient.set(s.patient_id, [])
    byPatient.get(s.patient_id).push(s)
  }

  // Saldo a favor (#19): the amount asked is owed NET of the patient's open credit
  // (spec #6 / #8). If credit covers everything, don't remind at all.
  const creditByPatient = new Map()
  const pids = [...byPatient.keys()]
  if (pids.length) {
    const { data: lotes, error: lErr } = await supabase
      .from('saldo_lotes').select('patient_id, remaining').in('patient_id', pids).gt('remaining', 0)
    if (lErr) throw new Error('lotes query: ' + lErr.message)
    for (const l of lotes || []) {
      creditByPatient.set(l.patient_id, round2((creditByPatient.get(l.patient_id) || 0) + Number(l.remaining || 0)))
    }
  }

  const report = { today, cutoff, live: !!live, dryRun: !!dryRun, sent: 0, skipped: 0, failed: 0, patients: [] }
  for (const [pid, rows] of byPatient) {
    const p = rows[0].patient || {}
    const isMenor = p.tipo_paciente === 'menor'
    const name = firstName(p.nombre) // tutor for a menor, the patient otherwise
    const gross = round2(rows.reduce((a, r) => a + Number(r.monto || 0), 0))
    const credit = creditByPatient.get(pid) || 0
    const net = round2(Math.max(0, gross - credit))
    const monto = fmtMonto(net)
    const fechas = rows.map((r) => r.fecha)
    const sesionesText = isMenor ? buildMinorSesionesText(p.nombre_2, fechas) : buildSesionesText(fechas)
    const toE164 = normalizePhone(p.telefono)
    const entry = {
      patient_id: pid, name, apellido: p.apellido || null,
      tipo: p.tipo_paciente || null, minor: isMenor ? firstName(p.nombre_2) : null,
      phone: toE164, rawPhone: p.telefono || null, gross, credit, monto, sesionesText,
      sessionIds: rows.map((r) => r.id),
    }
    // Fully covered by saldo a favor → nothing owed, don't remind (and don't stamp, so
    // it isn't treated as "reminded and unpaid" = en mora). The confirm-trigger pays it.
    if (net <= 0) { entry.result = 'skipped_covered_by_credit'; report.skipped++; report.patients.push(entry); continue }
    if (!toE164) { entry.result = 'skipped_no_phone'; report.skipped++; report.patients.push(entry); continue }
    if (dryRun || !live) { entry.result = 'dry'; report.patients.push(entry); continue }
    try {
      await sendDualhookPaymentReminder({ toE164, name, monto, sesionesText })
      const { error: uErr } = await supabase
        .from('sessions').update({ recordatorio_pago_at: now.toISOString() }).in('id', entry.sessionIds)
      if (uErr) { entry.result = 'sent_mark_failed'; entry.error = uErr.message; report.failed++ }
      else { entry.result = 'sent'; report.sent++ }
    } catch (e) {
      entry.result = 'failed'; entry.error = e.message; report.failed++
    }
    report.patients.push(entry)
  }
  return report
}
