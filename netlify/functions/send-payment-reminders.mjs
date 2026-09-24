// netlify/functions/send-payment-reminders.mjs
//
// Modern Netlify SCHEDULED Function — the payment-reminder protocol (spec #8).
// Cron '0 15 * * 1-6' = 10:00 America/Guayaquil (UTC-5, no DST), Monday–Saturday
// (never Sunday). Charges unpaid confirmed sessions dated ≤ today-2, one WhatsApp
// per patient (template recordatorio_pago_v2), then stamps recordatorio_pago_at.
//
// KILL-SWITCH: sends ONLY when PAYMENT_REMINDERS_LIVE === 'true'. Otherwise it's a
// dry run — logs the eligible plan, sends NOTHING, stamps NOTHING. Leave unset by
// default. (Manual/controlled runs go through payment-run.mjs, which can force live.)
//
// ⚠️ Scheduled functions are NOT HTTP-invocable — to run by hand use payment-run.mjs
//    or the Netlify UI → Functions → "Run now" (respects the kill-switch).

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { runPaymentReminders } from '../lib/paymentReminders.mjs'

export const config = { schedule: '0 15 * * 1-6' }

export default async () => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    console.error('[payment-reminders] SUPABASE_SERVICE_KEY not set')
    return new Response('Supabase key missing', { status: 500 })
  }
  const live = process.env.PAYMENT_REMINDERS_LIVE === 'true'
  const report = await runPaymentReminders(supabase, { now: new Date(), live })
  console.log('[payment-reminders]', JSON.stringify({
    live, today: report.today, cutoff: report.cutoff, sunday: report.skippedSunday || false,
    eligiblePatients: report.patients?.length || 0, sent: report.sent, failed: report.failed, skipped: report.skipped,
  }))
  return new Response(JSON.stringify(report), { headers: { 'Content-Type': 'application/json' } })
}
