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
//   • Amount = sum of the included sessions' monto. (Saldo-a-favor netting [#19] and
//     payer-aware routing are not built yet — TODO; today we sum monto and message the
//     patient's own phone.)

import { sendDualhookPaymentReminder, normalizePhone } from './whatsapp.mjs'

const GYE_OFFSET_H = -5 // Ecuador, no DST
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

// Build the {{3}} phrase from the included session dates. Examples:
//   ["2026-09-22"]                          → "tu sesión del 22 de septiembre"
//   ["2026-09-20","2026-09-22"]             → "tus sesiones del 20 y 22 de septiembre"
//   ["2026-09-30","2026-10-02"]             → "tus sesiones del 30 de septiembre y 2 de octubre"
export function buildSesionesText(fechas) {
  const parts = [...new Set(fechas)].sort().map(dm)
  if (parts.length === 1) return `tu sesión del ${parts[0].d} de ${parts[0].mes}`
  const sameMonth = parts.every((p) => p.mes === parts[0].mes)
  const joinList = (items) => items.length === 2
    ? `${items[0]} y ${items[1]}`
    : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
  if (sameMonth) return `tus sesiones del ${joinList(parts.map((p) => String(p.d)))} de ${parts[0].mes}`
  return `tus sesiones del ${joinList(parts.map((p) => `${p.d} de ${p.mes}`))}`
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
    .select('id, fecha, monto, patient_id, patient:patients(nombre, apellido, telefono)')
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

  const report = { today, cutoff, live: !!live, dryRun: !!dryRun, sent: 0, skipped: 0, failed: 0, patients: [] }
  for (const [pid, rows] of byPatient) {
    const p = rows[0].patient || {}
    const name = firstName(p.nombre)
    const monto = fmtMonto(rows.reduce((a, r) => a + Number(r.monto || 0), 0))
    const sesionesText = buildSesionesText(rows.map((r) => r.fecha))
    const toE164 = normalizePhone(p.telefono)
    const entry = {
      patient_id: pid, name, apellido: p.apellido || null,
      phone: toE164, rawPhone: p.telefono || null, monto, sesionesText,
      sessionIds: rows.map((r) => r.id),
    }
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
