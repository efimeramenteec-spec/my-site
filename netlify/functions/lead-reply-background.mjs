// netlify/functions/lead-reply-background.mjs
//
// Netlify BACKGROUND function (the `-background` suffix makes it async — the
// caller gets a 202 immediately and this keeps running, up to 15 min). It exists
// so the webhook can answer Meta with a 200 instantly while the bot classifies
// (Claude) and replies to a lead's FREE-TEXT message.
//
// #59 (replaces #54's "no delay"): the webhook queues each message in lead_inbox
// and wakes this function; processInbox (netlify/lib/leadTurns.mjs) waits until
// 4 s pass with no new message from that lead, then answers ALL the unanswered
// messages as ONE turn, one turn per lead at a time (leads.turn_lock_at).
//
// Invoked by whatsapp-cloud-webhook.mjs with { phone, leadId } and the shared
// verify token in `x-lead-verify` (same secret both functions already hold, so no
// new env var and no open relay that could make the bot send arbitrary messages).
// A legacy body { phone, msg, isNew } (in flight during a deploy) is queued here.
//
// Env: SUPABASE_SERVICE_KEY, WA_CLOUD_VERIFY_TOKEN, WA_DUALHOOK_API_KEY,
//      ANTHROPIC_API_KEY, LEAD_BOT_LIVE / LEAD_BOT_TEST_PHONES.

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { enqueueInbound, processInbox } from '../lib/leadTurns.mjs'

export default async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const expected = process.env.WA_CLOUD_VERIFY_TOKEN
  if (!expected || req.headers.get('x-lead-verify') !== expected) {
    console.warn('[lead-bg] bad/missing x-lead-verify — rejecting')
    return new Response('forbidden', { status: 403 })
  }

  let body
  try { body = await req.json() } catch { return new Response('bad body', { status: 400 }) }
  const { phone, leadId, msg, isNew } = body || {}
  if (!phone && !leadId) return new Response('missing phone/leadId', { status: 400 })

  const supabase = getSupabaseAdmin()
  if (!supabase) { console.error('[lead-bg] no SUPABASE_SERVICE_KEY'); return new Response('ok', { status: 200 }) }

  let id = leadId
  if (!id) {
    const { data: lead } = await supabase.from('leads').select('id').eq('phone', phone).maybeSingle()
    if (!lead) { console.warn(`[lead-bg] no lead for ${phone}`); return new Response('ok', { status: 200 }) }
    id = lead.id
    if (msg) await enqueueInbound(supabase, { lead, msg, isNew })
  }

  try {
    await processInbox(supabase, id)
  } catch (e) {
    console.warn('[lead-bg] processInbox failed (non-blocking):', e.message)
  }
  return new Response('ok', { status: 200 })
}
