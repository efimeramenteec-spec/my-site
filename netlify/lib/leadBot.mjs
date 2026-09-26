// netlify/lib/leadBot.mjs
//
// Lead-funnel brain (#4 + #20). Phase A = measurement: classify an inbound
// sender, create the `leads` row on first contact, and honour the manual-reply
// pause signal (smb_message_echoes). Phase B layers the button bot on top of
// these helpers; Phase C the follow-ups. Everything the bot SENDS is gated by
// LEAD_BOT_LIVE — but recording leads is measurement and always runs, so the
// funnel numbers start filling the moment this deploys, before the bot is live.
//
// A lead is any phone that messages the central number and is NOT already a
// patient, therapist or payer. Matching is the same fuzzy phone match used by the
// reminder loop (normalized E.164 OR last-9-digits) so number formatting can't
// misclassify a known contact as a lead.

import { normalizePhone } from './whatsapp.mjs'

const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)

function phoneMatches(rows, fromRaw) {
  const norm = normalizePhone(fromRaw)
  const l9 = last9(fromRaw)
  return (rows || []).some((r) => {
    const n = normalizePhone(r.telefono)
    return (norm && n === norm) || (l9 && last9(r.telefono) === l9)
  })
}

// True when the phone belongs to a therapist or payer. Patients are checked by
// the webhook's own patient cache before this is called, so we only need the two
// smaller tables here.
export async function isTherapistOrPayer(supabase, fromRaw) {
  const [th, py] = await Promise.all([
    supabase.from('therapists').select('telefono'),
    supabase.from('payers').select('telefono'),
  ])
  return phoneMatches(th.data, fromRaw) || phoneMatches(py.data, fromRaw)
}

// Click-to-WhatsApp ad referral → attribution fields. A CTWA entry carries a
// `referral` block on the FIRST message of the conversation; organic chats don't.
export function referralOf(msg) {
  const r = msg?.referral
  if (!r) return { source: 'whatsapp_organico', ad_source_id: null, ad_headline: null }
  return { source: 'meta_ctwa', ad_source_id: r.source_id || null, ad_headline: r.headline || null }
}

// Create the lead row on first contact, or return the existing one. Captures the
// WhatsApp profile name and CTWA attribution. Measurement only — sends nothing.
// Returns { lead, isNew } or null when the phone can't be normalized.
export async function recordLead(supabase, { msg, contact }) {
  const phone = normalizePhone(msg.from)
  if (!phone) return null

  const { data: existing } = await supabase.from('leads').select('*').eq('phone', phone).maybeSingle()
  if (existing) {
    const waName = contact?.profile?.name
    if (waName && !existing.wa_name) {
      await supabase.from('leads').update({ wa_name: waName, updated_at: new Date().toISOString() }).eq('id', existing.id)
      existing.wa_name = waName
    }
    return { lead: existing, isNew: false }
  }

  const { source, ad_source_id, ad_headline } = referralOf(msg)
  const row = { phone, wa_name: contact?.profile?.name || null, source, ad_source_id, ad_headline, stage: 'nuevo' }
  const { data, error } = await supabase.from('leads').insert(row).select('*').single()
  if (error) {
    // Two messages racing the first insert both violate the unique phone — take
    // whichever row won.
    const { data: raced } = await supabase.from('leads').select('*').eq('phone', phone).maybeSingle()
    if (raced) return { lead: raced, isNew: false }
    console.error('[lead] insert failed:', error.message)
    return null
  }
  console.log(`[lead] created ${data.id} phone=${phone} source=${source}${ad_headline ? ` ad="${ad_headline}"` : ''}`)
  return { lead: data, isNew: true }
}

// smb_message_echoes: an echo is a message the business number sent MANUALLY
// (Nicolás typing in WhatsApp, not an API send). For a lead that's the hard pause
// signal — the bot goes silent for that lead forever. This handler is also the
// Phase-A litmus test that Dualhook forwards echoes at all: every echo logs a
// distinctive marker so a single manual test message proves the pipe.
export async function handleEchoes(supabase, value) {
  const echoes = value?.message_echoes
  if (!Array.isArray(echoes) || echoes.length === 0) return 0
  let paused = 0
  for (const e of echoes) {
    const to = normalizePhone(e.to) // business → customer, so the lead is `to`
    console.log(`[wa-cloud] SMB ECHO forwarded by Dualhook — to=${e.to} type=${e.type}`)
    if (!to) continue
    const { data: lead } = await supabase.from('leads').select('id, bot_paused').eq('phone', to).maybeSingle()
    if (lead && !lead.bot_paused) {
      await supabase.from('leads').update({ bot_paused: true, updated_at: new Date().toISOString() }).eq('id', lead.id)
      paused++
      console.log(`[lead] ${lead.id} bot_paused — manual reply detected`)
    }
  }
  return paused
}
