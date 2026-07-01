// Shared WhatsApp-reminder helpers for the modern Netlify Functions runtime.
// Used by the scheduled sender (send-reminders) and the HTTP test path in the
// inbound webhook (twilio-webhook). Framework-free: plain fetch + supabase-js.

import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vnityzpuhnkumsyfnskz.supabase.co'
export const TZ_OFFSET = '-05:00' // Ecuador, no DST (matches src/lib/queries.js)

// Service-role client for server-side writes. Returns null when the key is unset,
// so callers can fail cleanly instead of throwing.
export function getSupabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!key) return null
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } })
}

// Best-effort E.164 normalization. Returns null when a number can't be made safe
// (we'd rather skip + log than message a wrong number).
export function normalizePhone(raw) {
  if (!raw) return null
  const p = String(raw).trim().replace(/[\s()\-.]/g, '')
  if (p.startsWith('+')) return /^\+\d{8,15}$/.test(p) ? p : null
  if (/^\d+$/.test(p)) {
    if (p.startsWith('593')) return `+${p}`
    if (p.length === 9 || p.length === 10) return `+593${p.replace(/^0/, '')}` // local EC mobile
  }
  return null
}

// Send one WhatsApp reminder via Twilio's Content API (approved quick-reply
// template; ONE variable {{1}} = patient name). Throws on any failure so the
// caller can decide how to react. The Content SID is read ONLY from env — never
// hardcode it (Netlify's secret scanner fails the build if its value appears).
export async function sendWhatsAppReminder({ toE164, name }) {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM
  const contentSid = process.env.TWILIO_CONTENT_SID
  if (!sid || !token || !from || !contentSid) {
    throw new Error('Twilio env var(s) missing — no send performed')
  }
  const body = new URLSearchParams({
    To: `whatsapp:${toE164}`,
    From: from,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify({ 1: name }),
  })
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`)
  return res.json()
}

// Send one reminder + stamp reminder_sent_at on success. Returns
// 'sent' | 'skipped' | 'failed' — never throws, so one bad session can't crash a
// batch. Mark ONLY after a confirmed send; if marking fails, accept a possible
// re-send rather than silently dropping the reminder.
export async function deliverReminder(supabase, s) {
  const name = String(s.patient?.nombre || '').trim() || 'paciente'
  const toE164 = normalizePhone(s.patient?.telefono)
  if (!toE164) { console.warn(`[reminders] skip session ${s.id}: un-normalizable phone`); return 'skipped' }
  try {
    await sendWhatsAppReminder({ toE164, name })
    const { error: upErr } = await supabase
      .from('sessions').update({ reminder_sent_at: new Date().toISOString() }).eq('id', s.id)
    if (upErr) { console.error(`[reminders] sent but mark failed for ${s.id}:`, upErr.message); return 'failed' }
    return 'sent'
  } catch (e) {
    console.error(`[reminders] send failed for session ${s.id}:`, e.message)
    return 'failed'
  }
}
