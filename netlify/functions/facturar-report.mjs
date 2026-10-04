// netlify/functions/facturar-report.mjs
//
// SCHEDULED (#16): every Monday and Thursday 09:00 GYE (14:00 UTC) — runs the
// facturar dry-run core (zero Contífico calls) and, if anything is pending,
// Web-Pushes the owner "Facturación pendiente … Escribe facturas al 9933".
// Nothing is emitted and no snapshot is made here: the list is frozen only when
// Nicolás asks for it ("facturas"), so it's fresh. See lib/facturarAprobacion.mjs.
//
// Scheduled functions are NOT HTTP-invocable — Netlify UI → Functions → Run now.
// Env: SUPABASE_SERVICE_KEY, VAPID_PRIVATE_KEY.

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { runReport } from '../lib/facturarAprobacion.mjs'

export const config = { schedule: '0 14 * * 1,4' }

export default async () => {
  const supabase = getSupabaseAdmin()
  if (!supabase) { console.error('[facturar-report] no SUPABASE_SERVICE_KEY'); return new Response('ok') }
  try {
    const r = await runReport(supabase)
    console.log(`[facturar-report] ready=${r.ready} blocked=${r.blocked} pushed=${r.pushed}`)
  } catch (e) {
    console.error('[facturar-report] failed:', e.message)
  }
  return new Response('ok')
}
