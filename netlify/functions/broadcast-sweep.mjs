// netlify/functions/broadcast-sweep.mjs
//
// SCHEDULED (#53): every 15 min. Sends the recipients of broadcasts in 'listo'
// (only 08:00–21:00 GYE), reconciles async delivery failures, and closes a
// finished broadcast with ONE notifyOwner listing who didn't get it. All logic in
// lib/broadcast.mjs.
//
// Scheduled functions are NOT HTTP-invocable — Netlify UI → Functions → Run now.
// Env: SUPABASE_SERVICE_KEY, WA_DUALHOOK_API_KEY.

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { runBroadcastSweep } from '../lib/broadcast.mjs'

export const config = { schedule: '*/15 * * * *' }

export default async () => {
  const supabase = getSupabaseAdmin()
  if (!supabase) { console.error('[broadcast] no SUPABASE_SERVICE_KEY'); return new Response('ok') }
  try {
    const r = await runBroadcastSweep(supabase)
    if (r.broadcasts.length) console.log(`[broadcast] inHours=${r.inHours} ${JSON.stringify(r.broadcasts)}`)
  } catch (e) {
    console.error('[broadcast] failed:', e.message)
  }
  return new Response('ok')
}
