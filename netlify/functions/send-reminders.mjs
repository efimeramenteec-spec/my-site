// netlify/functions/send-reminders.mjs
//
// Modern Netlify SCHEDULED Function — runs hourly (cron declared in-code via the
// `config` export, NOT netlify.toml). Sends a ~24h-before WhatsApp reminder for
// upcoming sessions, then stamps reminder_sent_at so each is reminded exactly once.
//
// KILL-SWITCH: the scheduled run sends ONLY when REMINDERS_LIVE === 'true'.
// Otherwise it's a dry run — logs the eligible count, sends NOTHING, and leaves
// reminder_sent_at untouched so those sessions stay eligible for the real run.
// Leave REMINDERS_LIVE UNSET by default.
//
// MANUAL TESTING: scheduled functions are NOT HTTP-invocable in the modern runtime.
//   • Controlled single send (bypasses kill-switch + window):
//       GET /.netlify/functions/twilio-webhook?test_session_id=<uuid>
//   • Or the Netlify UI → Functions → send-reminders → "Run now" (runs the batch;
//     respects the kill-switch, so it only sends when REMINDERS_LIVE === 'true').
//
// ⚠️ Requires sessions.reminder_sent_at — see supabase/add-reminder-sent-at.sql.

import { getSupabaseAdmin, deliverReminder, TZ_OFFSET } from '../lib/whatsapp.mjs'

export const config = { schedule: '0 * * * *' }

// Reminder window: appointments 23–25h from now. Hourly cron + a 2h window catches
// each upcoming session exactly once — no gaps, no double-sends.
const WINDOW_MIN_H = 23
const WINDOW_MAX_H = 25

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

export default async () => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    console.error('[send-reminders] SUPABASE_SERVICE_KEY not set')
    return new Response('Supabase key missing', { status: 500 })
  }

  const now = new Date()
  const winStart = new Date(now.getTime() + WINDOW_MIN_H * 3600e3)
  const winEnd = new Date(now.getTime() + WINDOW_MAX_H * 3600e3)
  // Pre-filter by date in the DB (today … +2 days covers the window across
  // midnight); precise datetime filtering happens in JS against the EC offset.
  const dayStr = (d) => d.toISOString().slice(0, 10)
  const fromDate = dayStr(now)
  const toDate = dayStr(new Date(now.getTime() + 48 * 3600e3))

  // tipo <> 'llamada': free intro calls booked from the public /agendar page get
  // NO WhatsApp reminder (calendar event + on-screen confirmation only), no
  // matter how the row was created.
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, fecha, hora_inicio, estado, reminder_sent_at, patient:patients(nombre, apellido, telefono)')
    .eq('estado', 'programada')
    .neq('tipo', 'llamada')
    .is('reminder_sent_at', null)
    .gte('fecha', fromDate)
    .lte('fecha', toDate)

  if (error) {
    console.error('[send-reminders] query error:', error.message)
    return new Response(error.message, { status: 500 })
  }

  const due = (sessions || []).filter((s) => {
    const start = new Date(`${s.fecha}T${(String(s.hora_inicio || '').slice(0, 8)) || '00:00:00'}${TZ_OFFSET}`)
    return start >= winStart && start < winEnd
  })
  console.log(`[send-reminders] now=${now.toISOString()} window=${WINDOW_MIN_H}-${WINDOW_MAX_H}h candidates=${sessions?.length || 0} due=${due.length}`)

  // Kill-switch. Default OFF: log how many WOULD be reminded, then exit without
  // sending and without touching reminder_sent_at (stay eligible for the real run).
  if (process.env.REMINDERS_LIVE !== 'true') {
    console.log(`[send-reminders] dry run — REMINDERS_LIVE not enabled, skipping ${due.length} eligible sessions`)
    return json({ dryRun: true, eligible: due.length, sent: 0 })
  }

  let sent = 0, failed = 0, skipped = 0
  for (const s of due) {
    const status = await deliverReminder(supabase, s)
    if (status === 'sent') sent++
    else if (status === 'skipped') skipped++
    else failed++
  }

  console.log(`[send-reminders] LIVE done sent=${sent} failed=${failed} skipped=${skipped}`)
  return json({ live: true, candidates: sessions?.length || 0, due: due.length, sent, failed, skipped })
}
