// netlify/lib/leadTurns.mjs
//
// #59 — MERGE + LOCK. A lead often sends a question in two or three messages
// seconds apart ("atienden adolescentes?" + "O terapias familiares?"). Answering
// each on its own ran two turns IN PARALLEL that repeated and contradicted each
// other. Now:
//   • the webhook QUEUES every free-text/media inbound in `lead_inbox`
//     (enqueueInbound) and wakes lead-reply-background;
//   • processInbox waits until QUIET_MS pass with no new inbound from that lead,
//     then takes ALL the unanswered messages as ONE turn (runBot with `msgs`,
//     texts joined with line breaks, in order);
//   • only one turn per lead runs at a time (leads.turn_lock_at). A message that
//     arrives during a turn waits for the next one; the turn holder loops back
//     and answers it once it's quiet again.
// Felt delay ≈ 4 s + processing. Taps are still answered inline (not here).

import { runBot } from './leadBot.mjs'

export const QUIET_MS = 4000
const LOCK_STALE_MS = 2 * 60 * 1000 // a crashed turn never blocks a lead for long
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Queue one inbound for the lead's next turn. Idempotent on the wamid (Meta retries).
export async function enqueueInbound(supabase, { lead, msg, isNew = false }) {
  const row = { lead_id: lead.id, wamid: msg?.id || null, msg, is_new: !!isNew, received_at: new Date().toISOString() }
  const { error } = await supabase.from('lead_inbox').upsert(row, { onConflict: 'wamid', ignoreDuplicates: true })
  if (error) throw new Error(`lead_inbox insert: ${error.message}`)
}

async function newestPending(supabase, leadId) {
  const { data } = await supabase.from('lead_inbox').select('received_at')
    .eq('lead_id', leadId).is('processed_at', null)
    .order('received_at', { ascending: false }).limit(1)
  return data?.[0] || null
}

async function acquireLock(supabase, leadId) {
  const { data: cur } = await supabase.from('leads').select('turn_lock_at').eq('id', leadId).maybeSingle()
  if (!cur) return false
  if (cur.turn_lock_at) {
    if (Date.now() - new Date(cur.turn_lock_at).getTime() < LOCK_STALE_MS) return false
    await supabase.from('leads').update({ turn_lock_at: null }).eq('id', leadId).eq('turn_lock_at', cur.turn_lock_at)
  }
  const { data } = await supabase.from('leads').update({ turn_lock_at: new Date().toISOString() })
    .eq('id', leadId).is('turn_lock_at', null).select('id')
  return !!(data && data.length)
}

async function releaseLock(supabase, leadId) {
  await supabase.from('leads').update({ turn_lock_at: null }).eq('id', leadId)
}

// Answer everything queued for this lead, one merged turn at a time. Any number
// of invocations may run this concurrently: they all wait for quiet, one wins
// the lock, the rest exit (their messages are taken by the winner).
export async function processInbox(supabase, leadId, { quietMs = QUIET_MS, sleep = defaultSleep } = {}) {
  for (let round = 0; round < 20; round++) {
    // 1. Wait until the newest unanswered message is quietMs old.
    for (;;) {
      const newest = await newestPending(supabase, leadId)
      if (!newest) return
      const age = Date.now() - new Date(newest.received_at).getTime()
      if (age >= quietMs) break
      await sleep(quietMs - age + 50)
    }
    // 2. One turn per lead.
    if (!(await acquireLock(supabase, leadId))) return
    try {
      // 3. Claim every unanswered message (including any that just slipped in).
      const { data: claimed } = await supabase.from('lead_inbox')
        .update({ processed_at: new Date().toISOString() })
        .eq('lead_id', leadId).is('processed_at', null).select('*')
      const rows = (claimed || []).sort((a, b) => (a.received_at > b.received_at ? 1 : -1))
      if (rows.length) {
        const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle()
        if (lead && !lead.bot_paused) {
          if (rows.length > 1) console.log(`[turn] lead ${leadId} — ${rows.length} messages merged into one turn`)
          await runBot(supabase, { lead, isNew: rows.some((r) => r.is_new), msgs: rows.map((r) => r.msg) })
        }
      }
    } catch (e) {
      console.warn('[turn] turn failed (non-blocking):', e.message)
    } finally {
      await releaseLock(supabase, leadId)
    }
    // 4. Loop: a message that arrived during the turn is answered next.
  }
}
