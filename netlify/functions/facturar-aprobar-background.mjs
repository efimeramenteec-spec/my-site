// netlify/functions/facturar-aprobar-background.mjs
//
// BACKGROUND function (#16): the owner tapped [Aprobar] on a "facturas" list.
// The webhook fires this (202 at once, runs up to 15 min) so a long emit loop
// never holds Meta's webhook 200. runAprobacion claims the snapshot atomically,
// emits ONLY its still-eligible sessions, WhatsApps their RIDEs and replies.
//
// Gated by the shared webhook secret in `x-lead-verify` (same pattern as
// lead-reply-background). It can only ever act on a 'pendiente' snapshot the
// owner was shown, and only replies to the owner number.
//
// Env: SUPABASE_SERVICE_KEY, WA_CLOUD_VERIFY_TOKEN, WA_DUALHOOK_API_KEY,
//      CONTIFICO_API_KEY, CONTIFICO_POS_TOKEN, VAPID_PRIVATE_KEY.

import { getSupabaseAdmin, ownerWhatsApp } from '../lib/whatsapp.mjs'
import { runAprobacion } from '../lib/facturarAprobacion.mjs'
import { notifyTherapist } from '../lib/push.mjs'

export default async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  const expected = process.env.WA_CLOUD_VERIFY_TOKEN
  if (!expected || req.headers.get('x-lead-verify') !== expected) {
    console.warn('[facturar-aprobar] bad/missing x-lead-verify — rejecting')
    return new Response('forbidden', { status: 403 })
  }
  let body
  try { body = await req.json() } catch { return new Response('bad body', { status: 400 }) }
  const snapshotId = body?.snapshot_id
  if (!snapshotId) return new Response('missing snapshot_id', { status: 400 })

  const supabase = getSupabaseAdmin()
  if (!supabase) { console.error('[facturar-aprobar] no SUPABASE_SERVICE_KEY'); return new Response('ok') }
  try {
    const r = await runAprobacion(supabase, ownerWhatsApp(), snapshotId)
    console.log(`[facturar-aprobar] ${snapshotId}:`, JSON.stringify(r))
  } catch (e) {
    console.error('[facturar-aprobar] failed:', e.message)
    await notifyTherapist(supabase, null, { title: 'Facturación: error', body: `La aprobación falló: ${e.message}. Revisar antes de volver a facturar.`, url: '/' })
  }
  return new Response('ok')
}
