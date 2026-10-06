// netlify/functions/lead-reply-background.mjs
//
// Netlify BACKGROUND function (the `-background` suffix makes it async — the
// caller gets a 202 immediately and this keeps running, up to 15 min). It exists
// so the webhook can answer Meta with a 200 instantly while the bot classifies
// (Claude) and replies to a lead's FREE-TEXT message.
//
// #54: NO artificial delay (REPLY_DELAY_MS = 0 — only the processing time) and NO
// burst coalescing: two messages seconds apart are each answered on their own;
// the once-per-conversation tail (the invitation) is guarded by an atomic claim in
// leadBot, so it never repeats. (Coalescing also folded tap titles like
// "Mi hijo/a" into the next typed text and misclassified it — gone with it.)
//
// Invoked by whatsapp-cloud-webhook.mjs with { phone, msg, isNew } and the shared
// verify token in `x-lead-verify` (same secret both functions already hold, so no
// new env var and no open relay that could make the bot send arbitrary messages).
//
// Env: SUPABASE_SERVICE_KEY, WA_CLOUD_VERIFY_TOKEN, WA_DUALHOOK_API_KEY,
//      ANTHROPIC_API_KEY, LEAD_BOT_LIVE / LEAD_BOT_TEST_PHONES.

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { runBot } from '../lib/leadBot.mjs'

const REPLY_DELAY_MS = 0 // #54 — no artificial wait
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export default async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const expected = process.env.WA_CLOUD_VERIFY_TOKEN
  if (!expected || req.headers.get('x-lead-verify') !== expected) {
    console.warn('[lead-bg] bad/missing x-lead-verify — rejecting')
    return new Response('forbidden', { status: 403 })
  }

  let body
  try { body = await req.json() } catch { return new Response('bad body', { status: 400 }) }
  const { phone, msg, isNew } = body || {}
  if (!phone || !msg) return new Response('missing phone/msg', { status: 400 })

  const supabase = getSupabaseAdmin()
  if (!supabase) { console.error('[lead-bg] no SUPABASE_SERVICE_KEY'); return new Response('ok', { status: 200 }) }

  if (REPLY_DELAY_MS > 0) await sleep(REPLY_DELAY_MS)

  const { data: lead } = await supabase.from('leads').select('*').eq('phone', phone).maybeSingle()
  if (!lead) { console.warn(`[lead-bg] no lead for ${phone}`); return new Response('ok', { status: 200 }) }
  if (lead.bot_paused) return new Response('ok', { status: 200 })

  try {
    await runBot(supabase, { lead, isNew: !!isNew, msg })
  } catch (e) {
    console.warn('[lead-bg] runBot failed (non-blocking):', e.message)
  }
  return new Response('ok', { status: 200 })
}
