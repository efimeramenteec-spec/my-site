// netlify/functions/payment-run.mjs
//
// Token-guarded HTTP trigger for the payment-reminder protocol — because scheduled
// functions (send-payment-reminders.mjs) can't be invoked over HTTP. Lets us PREVIEW
// (dry run) and, when explicitly asked, run a real send by hand (e.g. the go-live
// batch for a specific day, or catching up after an outage).
//
//   ?t=TOKEN&mode=dry   → compute + return the plan; sends NOTHING, stamps NOTHING
//   ?t=TOKEN&mode=live  → actually send + stamp recordatorio_pago_at (bypasses the
//                         PAYMENT_REMINDERS_LIVE kill-switch, ON PURPOSE — this path
//                         is the manual override)
//
// Any request without the token returns 404. Uses the same core as the scheduled
// sender, so eligibility/grouping/copy are identical.

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { runPaymentReminders } from '../lib/paymentReminders.mjs'

const TOKEN = '69ef36f5858533f06ce695d6e17b87e2'

const json = (o, s = 200) =>
  new Response(JSON.stringify(o, null, 2), { status: s, headers: { 'Content-Type': 'application/json' } })

export default async (req) => {
  const url = new URL(req.url)
  if (url.searchParams.get('t') !== TOKEN) return new Response('Not Found', { status: 404 })

  const supabase = getSupabaseAdmin()
  if (!supabase) return json({ error: 'SUPABASE_SERVICE_KEY not set' }, 500)

  const mode = (url.searchParams.get('mode') || 'dry').toLowerCase()
  const live = mode === 'live'
  try {
    const report = await runPaymentReminders(supabase, { now: new Date(), live, dryRun: !live })
    return json({ mode, report })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
