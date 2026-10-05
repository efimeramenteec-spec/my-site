// netlify/functions/broadcast-admin.mjs
//
// ADMIN endpoint (#53) for the 'filtrando' step of a broadcast: the executor
// session messages the broadcast's THERAPIST (the review list, a clarification,
// the final confirmation). WA_DUALHOOK_API_KEY is a masked Netlify secret, so
// these sends can't run locally. The recipient is ALWAYS the therapist of the
// broadcast (therapists.telefono) — this endpoint can't message anyone else.
// Copy goes out as-is (sendStaffText, no sanitizer: therapist copy keeps 🐚✨).
//
// POST ?token=<LEAD_TOOLS_TOKEN>  body { broadcast_id, body }  → { ok, wamid }

import { getSupabaseAdmin, normalizePhone } from '../lib/whatsapp.mjs'
import { sendStaffText } from '../lib/waSend.mjs'

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } })

export default async (req) => {
  const url = new URL(req.url)
  const expected = process.env.LEAD_TOOLS_TOKEN
  if (!expected || url.searchParams.get('token') !== expected) return new Response('forbidden', { status: 403 })
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)
  const { broadcast_id: id, body } = await req.json().catch(() => ({}))
  if (!id || !body?.trim()) return json({ ok: false, error: 'broadcast_id and body required' }, 400)
  const supabase = getSupabaseAdmin()
  if (!supabase) return json({ ok: false, error: 'no SUPABASE_SERVICE_KEY' }, 500)
  const { data: b, error } = await supabase.from('broadcasts')
    .select('id, terapeuta:therapists(telefono)').eq('id', id).maybeSingle()
  if (error || !b) return json({ ok: false, error: error?.message || 'broadcast not found' }, 404)
  const to = normalizePhone(b.terapeuta?.telefono)
  if (!to) return json({ ok: false, error: 'therapist phone missing' }, 400)
  try {
    const wamid = await sendStaffText(to, body, { previewUrl: false })
    return json({ ok: true, wamid })
  } catch (e) {
    return json({ ok: false, error: e.message }, 502)
  }
}
