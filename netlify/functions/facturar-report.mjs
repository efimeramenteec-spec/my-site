// netlify/functions/facturar-report.mjs
//
// SCHEDULED (#16, #45): every Monday and Thursday 09:00 GYE (14:00 UTC) — runs the
// facturar dry-run core (zero Contífico calls) and, if anything is ready or
// blocked, freezes a 'pendiente' snapshot (origen 'cron') and sends Nicolás the
// list + [Aprobar] [Ahora no] through the owner outbox (lib/ownerOutbox.mjs):
// directly if his 24h window is open, else ping_nico and his tap flushes it.
// Nothing is emitted here — only his [Aprobar] tap emits. See lib/facturarAprobacion.mjs.
//
// Scheduled functions are NOT HTTP-invocable — Netlify UI → Functions → Run now.
// Env: SUPABASE_SERVICE_KEY, WA_DUALHOOK_API_KEY, VAPID_PRIVATE_KEY (push fallback).

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { runReport } from '../lib/facturarAprobacion.mjs'

export const config = { schedule: '0 14 * * 1,4' }

export default async () => {
  const supabase = getSupabaseAdmin()
  if (!supabase) { console.error('[facturar-report] no SUPABASE_SERVICE_KEY'); return new Response('ok') }
  try {
    const r = await runReport(supabase)
    console.log(`[facturar-report] ready=${r.ready} blocked=${r.blocked} notified=${r.notified} via=${r.via || '-'} snapshot=${r.snapshot || '-'}`)
  } catch (e) {
    console.error('[facturar-report] failed:', e.message)
  }
  return new Response('ok')
}
