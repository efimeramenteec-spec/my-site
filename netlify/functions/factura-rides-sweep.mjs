// netlify/functions/factura-rides-sweep.mjs
//
// Modern Netlify SCHEDULED Function — every 15 min (#47). WhatsApps the RIDE of
// every invoiced, not-yet-sent session as soon as the SRI authorizes it, and
// alerts Nicolás once if a doc is still unauthorized 48h later. All logic in
// netlify/lib/rideSweep.mjs. Manual sends stay on /facturar mode=send-rides.
//
// Scheduled functions aren't HTTP-invocable — trigger from the Netlify UI
// (Functions → factura-rides-sweep → Run now).
//
// Env: SUPABASE_SERVICE_KEY, CONTIFICO_API_KEY, WA_DUALHOOK_API_KEY (+ owner outbox's).

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { sweepRides } from '../lib/rideSweep.mjs'

export const config = { schedule: '*/15 * * * *' }

export default async () => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    console.error('[ride-sweep] SUPABASE_SERVICE_KEY not set')
    return new Response('Supabase key missing', { status: 500 })
  }
  try {
    const r = await sweepRides(supabase)
    const { results, ...counts } = r
    console.log('[ride-sweep]', JSON.stringify(counts),
      results.map((x) => `${x.documento}:${x.sent ? 'sent' : 'failed'}`).join(' '))
  } catch (e) {
    console.error('[ride-sweep] failed:', e.message)
  }
  return new Response('ok')
}
