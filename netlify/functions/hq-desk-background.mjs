// netlify/functions/hq-desk-background.mjs
//
// Efimeramente HQ WhatsApp desk (#96). Netlify BACKGROUND function: the webhook gets a 202
// right away and this answers Nicolás's "Michael: ..." order (Claude + read-only snapshot,
// reply via the owner outbox). All logic in netlify/lib/hqDesk.mjs — read-only by design.
//
// Invoked by whatsapp-cloud-webhook.mjs with { agent, texto, wamid, from, ts }, or by hq-chat
// with { orderId } (#97 office game), and the shared
// verify token in `x-lead-verify` (same gate as lead-reply-background).
// Env: SUPABASE_SERVICE_KEY, WA_CLOUD_VERIFY_TOKEN, WA_DUALHOOK_API_KEY, ANTHROPIC_API_KEY.

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { handleHqOrder, handlePanelOrder } from '../lib/hqDesk.mjs'

export default async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  const expected = process.env.WA_CLOUD_VERIFY_TOKEN
  if (!expected || req.headers.get('x-lead-verify') !== expected) {
    console.warn('[hq-desk] bad/missing x-lead-verify — rejecting')
    return new Response('forbidden', { status: 403 })
  }
  let body
  try { body = await req.json() } catch { return new Response('bad body', { status: 400 }) }
  const { agent, texto, wamid, from, ts, orderId } = body || {}
  try {
    // #97: { orderId } = an office-game order already stored by hq-chat (owner-gated).
    const r = orderId
      ? await handlePanelOrder(getSupabaseAdmin(), orderId)
      : await handleHqOrder(getSupabaseAdmin(), { agent, texto, wamid, from, msgTs: ts })
    console.log('[hq-desk]', JSON.stringify(r))
    return new Response(JSON.stringify(r), { status: 200 })
  } catch (e) {
    console.error('[hq-desk] failed:', e.message)
    return new Response('error', { status: 500 })
  }
}
