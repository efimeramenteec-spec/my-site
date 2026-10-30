// netlify/functions/hq-chat.mjs
//
// Efimeramente HQ office game (#97): Nicolás talks to an employee from the /hq game. Owner-only.
//   POST { agent, texto }  → stores an hq_orders row (canal 'panel', estado 'nuevo'), wakes
//                            hq-desk-background with { orderId } and answers { id } at once.
//   GET  ?id=<uuid>        → { id, estado, respuesta } so the game can poll for the reply.
// Same read-only brain as the WhatsApp desk (netlify/lib/hqDesk.mjs). Nothing is ever sent.
// Env: SUPABASE_SERVICE_KEY, WA_CLOUD_VERIFY_TOKEN (shared secret for the background call).

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { corsFor, ownerGateStatus } from '../lib/ownerGate.mjs'
import { HQ_AGENTS } from '../lib/hqDesk.mjs'

const MAX_TEXT = 1000

export default async (req) => {
  const headers = corsFor(req, 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } })

  const supabase = getSupabaseAdmin()
  if (!supabase) return json({ error: 'server_misconfigured' }, 500)
  const denied = await ownerGateStatus(supabase, req)
  if (denied) return json({ error: denied === 401 ? 'unauthorized' : 'forbidden' }, denied)

  if (req.method === 'GET') {
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return json({ error: 'bad_request' }, 400)
    const { data, error } = await supabase.from('hq_orders').select('id, agent, estado, respuesta').eq('id', id).single()
    if (error || !data) return json({ error: 'not_found' }, 404)
    return json(data)
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body
  try { body = await req.json() } catch { return json({ error: 'bad_body' }, 400) }
  const agent = String(body?.agent || '').toLowerCase()
  const texto = String(body?.texto || '').trim().slice(0, MAX_TEXT)
  if (!HQ_AGENTS.includes(agent) || !texto) return json({ error: 'bad_request' }, 400)

  const { data: row, error } = await supabase.from('hq_orders')
    .insert({ agent, texto, estado: 'nuevo', canal: 'panel' }).select('id').single()
  if (error || !row) return json({ error: 'insert_failed' }, 500)

  const base = process.env.URL || 'https://efimeramente-panel.netlify.app'
  try {
    await fetch(`${base}/.netlify/functions/hq-desk-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-lead-verify': process.env.WA_CLOUD_VERIFY_TOKEN || '' },
      body: JSON.stringify({ orderId: row.id }),
    })
  } catch (e) { console.error('[hq-chat] background invoke failed:', e.message) }
  return json({ id: row.id })
}
