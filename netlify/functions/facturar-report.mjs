// netlify/functions/facturar-report.mjs
//
// SCHEDULED (#16, #45, #72): every Monday and Thursday 09:00 GYE (14:00 UTC) —
// EMITS by itself every eligible session (no approval step since 13 Oct), logs the
// run (factura_aprobaciones origen 'auto'), then ONE informational notifyOwner
// (kind 'facturas_emitidas'): "{n} facturas emitidas ($total): …" + failures +
// blocked + en espera. RIDEs go out via the 15-min sweep. See lib/facturarAprobacion.mjs.
//
// Scheduled functions are NOT HTTP-invocable — Netlify UI → Functions → Run now.
// Env: SUPABASE_SERVICE_KEY, CONTIFICO_API_KEY, CONTIFICO_POS_TOKEN, WA_DUALHOOK_API_KEY, VAPID_PRIVATE_KEY.

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { withCronLock } from '../lib/cronLock.mjs'
import { runReport } from '../lib/facturarAprobacion.mjs'

export const config = { schedule: '0 14 * * 1,4' }

async function run() {
  const supabase = getSupabaseAdmin()
  if (!supabase) { console.error('[facturar-report] no SUPABASE_SERVICE_KEY'); return new Response('ok') }
  try {
    const r = await runReport(supabase)
    console.log(`[facturar-report] emitted=${r.emitted} failed=${r.failed} blocked=${r.blocked} notified=${r.notified} via=${r.via || '-'} snapshot=${r.snapshot || '-'}${r.skipped ? ' skipped=' + r.skipped : ''}`)
  } catch (e) {
    console.error('[facturar-report] failed:', e.message)
  }
  return new Response('ok')
}

// #99: Netlify retries a scheduled run that passes ~15 s while the first one keeps
// going — the lock makes the retry exit instead of sending everything twice.
export default async () => {
  const supabase = getSupabaseAdmin()
  if (!supabase) return run()
  const r = await withCronLock(supabase, 'facturar-report', run)
  return r.result || new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json' } })
}
