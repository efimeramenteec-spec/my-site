// netlify/functions/lead-reply-background.mjs
//
// Netlify BACKGROUND function (the `-background` suffix makes it async — the
// caller gets a 202 immediately and this keeps running, up to 15 min). It exists
// so the webhook can answer Meta with a 200 instantly and never sleep in-request:
// for a lead's FREE-TEXT message the webhook fires this, which waits (typing
// indicator already showing) and THEN runs the bot's reply. Button taps skip this
// entirely — they're answered inline in the webhook.
//
// Two behaviours live here (both #27/#30 follow-ups):
//   • Tighter felt delay — the wait is shaved by the classify budget so the Claude
//     path lands near REPLY_DELAY_MS (~20s), not REPLY_DELAY_MS + the Sonnet call
//     (~25s before). We wait, then classify; the classify time overlaps the target.
//   • Burst coalesce — a lead who fires several quick texts spawns one invocation
//     each. Only the LAST one replies, and it replies to the WHOLE burst folded
//     into a single message, so the lead gets one coherent answer, not N staggered
//     ones. Coordination is stateless: each invocation checks whether a newer
//     inbound landed during its wait (via whatsapp_messages) and bails if so.
//
// Invoked by whatsapp-cloud-webhook.mjs with { phone, msg, isNew } and the shared
// verify token in `x-lead-verify` (same secret both functions already hold, so no
// new env var and no open relay that could make the bot send arbitrary messages).
//
// Env: SUPABASE_SERVICE_KEY, WA_CLOUD_VERIFY_TOKEN, WA_DUALHOOK_API_KEY,
//      ANTHROPIC_API_KEY, LEAD_BOT_LIVE / LEAD_BOT_TEST_PHONES.

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { runBot } from '../lib/leadBot.mjs'

const REPLY_DELAY_MS = 20000 // target felt delay from the LAST message in a burst (#27)
// runBot's free-text path spends ~2.5–4.5s in the Sonnet classify (8s timeout).
// Shave an estimate off the up-front wait so that call lands the reply near
// REPLY_DELAY_MS instead of adding on top of it. Deterministic paths (named
// therapist / agendar / greeting) just reply a touch sooner — fine.
const CLASSIFY_BUDGET_MS = 5000
const WAIT_MS = Math.max(0, REPLY_DELAY_MS - CLASSIFY_BUDGET_MS)
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

  // The typing indicator is already showing (the webhook sent the read receipt).
  // Wait most of the delay up front; the classify (if any) eats the remainder.
  await sleep(WAIT_MS)

  const { data: lead } = await supabase.from('leads').select('*').eq('phone', phone).maybeSingle()
  if (!lead) { console.warn(`[lead-bg] no lead for ${phone}`); return new Response('ok', { status: 200 }) }
  if (lead.bot_paused) return new Response('ok', { status: 200 }) // manual reply during the wait

  // ── Burst coalesce ──────────────────────────────────────────────────────────
  // One newest-first query over this lead's inbound history serves both jobs: the
  // "am I still the last message?" check and the combined-text gather.
  const msgId = msg.id || null
  const myText = msg.type === 'text' ? (msg.text?.body || '') : ''
  const digits = String(phone).replace(/\D/g, '')
  const { data: hist } = await supabase.from('whatsapp_messages')
    .select('twilio_sid, cuerpo, received_at')
    .eq('direccion', 'inbound')
    .eq('raw_payload->message->>from', digits)
    .order('received_at', { ascending: false }).limit(15)
  const rows = hist || []

  // A newer inbound landed during the wait → a later invocation (which wakes after
  // its own wait) will answer the whole burst. Bail so we don't double-reply.
  if (msgId && rows.length && rows[0].twilio_sid && rows[0].twilio_sid !== msgId) {
    console.log(`[lead-bg] superseded — newer msg for ${phone}, bailing`)
    return new Response('ok', { status: 200 })
  }

  // Fold every unanswered text since our last reply into one message, so the bot
  // classifies the full thought instead of only the first line of a burst.
  let runMsg = msg
  if (myText) {
    const floor = lead.last_bot_at ? new Date(lead.last_bot_at).getTime() : 0
    const burst = rows
      .filter((r) => r.cuerpo && !r.cuerpo.startsWith('[') &&
        (!floor || new Date(r.received_at).getTime() > floor))
      .reverse() // chronological
      .map((r) => r.cuerpo.trim())
      .filter(Boolean)
    const combined = burst.join('\n').trim()
    if (combined && combined !== myText.trim()) {
      runMsg = { ...msg, type: 'text', text: { body: combined } }
      console.log(`[lead-bg] coalesced ${burst.length} msg(s) for ${phone}`)
    }
  }

  try {
    await runBot(supabase, { lead, isNew: !!isNew, msg: runMsg })
  } catch (e) {
    console.warn('[lead-bg] runBot failed (non-blocking):', e.message)
  }
  return new Response('ok', { status: 200 })
}
