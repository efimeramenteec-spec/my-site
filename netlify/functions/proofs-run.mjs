// netlify/functions/proofs-run.mjs
//
// Token-guarded HTTP trigger for comprobante AUTO-MARK — because the scheduled
// processor (process-proofs.mjs) can't be invoked over HTTP. Lets us PREVIEW what
// would auto-mark (dry) and run a real pass by hand.
//
//   ?t=TOKEN&mode=dry   → OCR + decide, return the plan; marks NOTHING
//   ?t=TOKEN&mode=live  → also apply the marks (bypasses COMPROBANTES_AUTO_LIVE)
//   &days=N             → look-back window (default 7)
//
// Any request without the token → 404. Same core as the scheduled processor.

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { runProofAutomation } from '../lib/proofReconcile.mjs'

const TOKEN = '0ec013040a1e6aaad8651983b4019567'

const json = (o, s = 200) => new Response(JSON.stringify(o, null, 2), { status: s, headers: { 'Content-Type': 'application/json' } })

export default async (req) => {
  const url = new URL(req.url)
  if (url.searchParams.get('t') !== TOKEN) return new Response('Not Found', { status: 404 })

  const supabase = getSupabaseAdmin()
  if (!supabase) return json({ error: 'SUPABASE_SERVICE_KEY not set' }, 500)

  const mode = (url.searchParams.get('mode') || 'dry').toLowerCase()
  const live = mode === 'live'
  const daysBack = Number(url.searchParams.get('days')) || 7
  try {
    const report = await runProofAutomation(supabase, { now: new Date(), live, daysBack })
    return json({ mode, report })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
