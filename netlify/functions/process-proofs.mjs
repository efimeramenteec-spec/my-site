// netlify/functions/process-proofs.mjs
//
// Modern Netlify SCHEDULED Function — comprobante AUTO-MARK (spec #2). Every 10
// min it OCRs new inbound payment proofs, applies the warning criteria, and
// auto-marks the clean ones paid (any warning → left in the Comprobantes card for
// Nicolás). Runs server-side so payments are settled BEFORE the 10:00 reminder
// cron, and without anyone opening the app.
//
// KILL-SWITCH: only acts when COMPROBANTES_AUTO_LIVE === 'true'. Otherwise it's a
// no-op (skips entirely — no OCR, no marking) so it doesn't burn OCR credits before
// go-live. Manual previews/runs go through proofs-run.mjs.
//
// ⚠️ Scheduled functions aren't HTTP-invocable — use proofs-run.mjs to run by hand.

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { runProofAutomation } from '../lib/proofReconcile.mjs'

export const config = { schedule: '*/10 * * * *' }

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } })

export default async () => {
  const supabase = getSupabaseAdmin()
  if (!supabase) { console.error('[process-proofs] no SUPABASE_SERVICE_KEY'); return new Response('Supabase key missing', { status: 500 }) }

  if (process.env.COMPROBANTES_AUTO_LIVE !== 'true') {
    console.log('[process-proofs] COMPROBANTES_AUTO_LIVE off — skipping')
    return json({ skipped: true })
  }

  const report = await runProofAutomation(supabase, { now: new Date(), live: true })
  console.log('[process-proofs]', JSON.stringify({
    today: report.today, proofs: report.items.length, marked: report.marked, withheld: report.withheld, failed: report.failed,
  }))
  return json(report)
}
