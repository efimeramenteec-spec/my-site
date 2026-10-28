// netlify/functions/owner-outbox-send.mjs
//
// Delivers ONE pending owner_outbox row now (#92g: the POST-01 carousel preview).
// The recipient is ALWAYS the owner (ownerWhatsApp) — this endpoint can't message
// anyone else. Auth = knowing the row's uuid: rows are created only by the
// service role or the owner (owner-only RLS). Window closed → nothing is sent and
// NO template/ping goes out ({ ok:false, error:'window_closed' }): Nicolás writes
// to the 9933 and the webhook's flushOwnerOutbox delivers it (or call this again).
//
// GET|POST ?id=<owner_outbox.id>  → { ok, wamids } | { ok:false, error }

import { getSupabaseAdmin, ownerWhatsApp } from '../lib/whatsapp.mjs'
import { deliverRow, lastOwnerInbound, windowOpen } from '../lib/ownerOutbox.mjs'

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async (req) => {
  const id = new URL(req.url).searchParams.get('id')
  if (!id || !UUID.test(id)) return new Response('forbidden', { status: 403 })
  const supabase = getSupabaseAdmin()
  if (!supabase) return json({ ok: false, error: 'no SUPABASE_SERVICE_KEY' }, 500)
  const { data: row } = await supabase.from('owner_outbox').select('*').eq('id', id).eq('estado', 'pendiente').maybeSingle()
  if (!row) return new Response('forbidden', { status: 403 })
  const to = ownerWhatsApp()
  // Only ever Nicolás's own number (+593968029896), whatever OWNER_WHATSAPP says.
  if (String(to || '').replace(/\D/g, '').slice(-9) !== '968029896') return json({ ok: false, error: 'owner phone mismatch' }, 500)
  if (!windowOpen(await lastOwnerInbound(supabase, to), new Date())) return json({ ok: false, error: 'window_closed' }, 409)
  const r = await deliverRow(supabase, to, row)
  return json({ ok: r.sent, wamids: r.wamids || [], error: r.error || (r.skipped ? 'ya enviado' : undefined) }, r.sent ? 200 : 502)
}
