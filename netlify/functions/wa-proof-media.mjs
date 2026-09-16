// netlify/functions/wa-proof-media.mjs
//
// OWNER-ONLY media proxy for the WhatsApp payment-proof reading layer
// (Comprobantes page). The Dualhook connection-scoped API key (dh_live_…) is a
// server-only secret, so the browser can never fetch WhatsApp media directly —
// it asks this function, which:
//   1. verifies the caller's Supabase access token and requires role 'owner'
//      (mirrors whatsapp_messages RLS, which is owner-only),
//   2. loads the whatsapp_messages row (service role), pulls the media id out of
//      raw_payload (image.id / document.id),
//   3. two-hop Dualhook fetch (Graph-API shaped):
//        GET https://api.dualhook.com/v25.0/{media-id}  (Bearer key) → { url, mime_type }
//        GET {url}                                       (Bearer key) → bytes
//   4. streams the bytes back with the right content-type.
//
// Read-only: never sends, never touches sessions/pagado. The Dualhook key stays
// on the server; only owner-authenticated requests get a byte through.
//
// GET /.netlify/functions/wa-proof-media?id=<whatsapp_messages.id>
//   Authorization: Bearer <Supabase access token>
// Env:
//   WA_DUALHOOK_API_KEY   (required) — Dualhook connection-scoped key (dh_live_…).
//   SUPABASE_SERVICE_KEY  (required) — service-role read (bypasses RLS; we gate on owner ourselves).

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { fetchDualhookMedia, mediaIdOf } from '../lib/waMedia.mjs'

const ALLOWED_ORIGINS = [
  'https://efimeramente-panel.netlify.app',
  'https://genuine-praline-0f8e70.netlify.app',
  'http://localhost:5173',
]

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  }
}

export default async (req) => {
  const cors = corsHeaders(req.headers.get('origin') || '')
  // 204 is a null-body status — Response(null, …), never Response('', …).
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } })

  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405)

  const apiKey = process.env.WA_DUALHOOK_API_KEY
  const supabase = getSupabaseAdmin()
  if (!apiKey || !supabase) return json({ error: 'server_misconfigured' }, 500)

  // ── Owner-only gate (mirrors whatsapp_messages RLS) ──────────────────────────
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'unauthorized' }, 401)
  const { data: userData, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !userData?.user) return json({ error: 'unauthorized' }, 401)
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', userData.user.id).single()
  if (profile?.role !== 'owner') return json({ error: 'forbidden' }, 403)

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return json({ error: 'bad_request' }, 400)

  // Load the proof row and extract its media id.
  const { data: row, error: rowErr } = await supabase
    .from('whatsapp_messages')
    .select('id, direccion, raw_payload')
    .eq('id', id)
    .single()
  if (rowErr || !row) return json({ error: 'not_found' }, 404)
  if (row.direccion !== 'inbound') return json({ error: 'not_found' }, 404)
  const mediaId = mediaIdOf(row.raw_payload?.message)
  if (!mediaId) return json({ error: 'no_media' }, 404)

  try {
    const { buffer, contentType } = await fetchDualhookMedia(mediaId)
    return new Response(buffer, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': contentType,
        // Sensitive bank screenshots — never cache on shared infra.
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error('[wa-proof-media] fetch failed:', err?.message)
    return json({ error: 'media_unavailable' }, 502)
  }
}
