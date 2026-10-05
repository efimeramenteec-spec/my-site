// netlify/functions/sesiones-pendientes.mjs
//
// SCHEDULED (#52): every day 08:30 GYE (13:30 UTC). Each therapist gets one
// WhatsApp per past session of theirs still in Pendiente (estado 'programada',
// never llamadas) with [Ocurrió] [No ocurrió]; their tap in whatsapp-cloud-webhook
// collapses it. 3 days unanswered → notifyOwner. All logic in
// lib/sesionesPendientes.mjs. This function never changes an estado.
//
// Scheduled functions are NOT HTTP-invocable — Netlify UI → Functions → Run now.
// Env: SUPABASE_SERVICE_KEY, WA_DUALHOOK_API_KEY, VAPID_PRIVATE_KEY (push fallback).

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { runSesionesPendientes } from '../lib/sesionesPendientes.mjs'

export const config = { schedule: '30 13 * * *' }

export default async () => {
  const supabase = getSupabaseAdmin()
  if (!supabase) { console.error('[pendientes] no SUPABASE_SERVICE_KEY'); return new Response('ok') }
  try {
    const r = await runSesionesPendientes(supabase)
    console.log(`[pendientes] ${r.today} ${JSON.stringify(r.therapists.map(({ sessions, ...t }) => t))} escalated=${r.escalated.length}`)
  } catch (e) {
    console.error('[pendientes] failed:', e.message)
  }
  return new Response('ok')
}
