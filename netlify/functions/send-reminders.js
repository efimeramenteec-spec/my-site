// netlify/functions/send-reminders.js
//
// Netlify SCHEDULED Function (v1 / CommonJS) — runs hourly. The cron is declared
// in netlify.toml:  [functions."send-reminders"]  schedule = "0 * * * *"
//
// Sends a ~24h-before WhatsApp reminder for upcoming sessions via Twilio's
// Content API (approved quick-reply template), then stamps reminder_sent_at so
// each session is reminded exactly once. Matches the v1 style of calendar.js
// (CommonJS, exports.handler, plain fetch). Requires Node 18+ (global fetch) —
// Netlify's default runtime.
//
// ── ENV VARS (set in Netlify dashboard) ───────────────────────────────────────
//   SUPABASE_URL          — defaults to the project URL below if unset
//   SUPABASE_SERVICE_KEY  — service_role JWT (set in Netlify env)
//   TWILIO_ACCOUNT_SID    — Twilio Account SID (live)
//   TWILIO_AUTH_TOKEN     — Twilio Auth Token (live)
//   TWILIO_WHATSAPP_FROM  — sender, e.g. "whatsapp:+14155238886" (live)
//   TWILIO_CONTENT_SID    — approved template SID "HX…" (live)
//   (if any are missing, the send throws and is logged; the batch never crashes.)
//
// ⚠️ MIGRATION REQUIRED FIRST: sessions.reminder_sent_at (timestamptz, nullable)
//    must exist — see supabase/add-reminder-sent-at.sql. Until it's added, the
//    query below fails (column does not exist).
//
// TEMPLATE: ONE variable — {{1}} = patient name. The body has no date/time/link.
//
// ⚠️ APPROVAL PENDING: the live template (HXb2b458a10454fccc4408f87bc859d231) is
//    submitted but not yet WhatsApp-approved. Sends will fail with a Twilio error
//    until approval clears — expected in early testing, logged per-session, never
//    crashes the batch.

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vnityzpuhnkumsyfnskz.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const TZ_OFFSET = '-05:00' // Ecuador, no DST (matches src/lib/queries.js)

// Reminder window: appointments 23–25h from now. The cron runs hourly, so a 2h
// window catches each upcoming session exactly once — no gaps, no double-sends.
const WINDOW_MIN_H = 23
const WINDOW_MAX_H = 25

// Best-effort E.164 normalization. Returns null when a number can't be made safe
// (we'd rather skip + log than message a wrong number). ~140/151 patients are
// already clean +593…; this handles the stray-formatting and digits-only cases.
function normalizePhone(raw) {
  if (!raw) return null
  const p = String(raw).trim().replace(/[\s()\-.]/g, '') // strip spaces, parens, dashes, dots
  if (p.startsWith('+')) return /^\+\d{8,15}$/.test(p) ? p : null
  if (/^\d+$/.test(p)) {
    if (p.startsWith('593')) return `+${p}`
    if (p.length === 9 || p.length === 10) return `+593${p.replace(/^0/, '')}` // local EC mobile
  }
  return null
}

async function sendWhatsAppReminder({ toE164, name }) {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM
  const contentSid = process.env.TWILIO_CONTENT_SID
  if (!sid || !token || !from || !contentSid) {
    throw new Error('Twilio env var(s) missing — no send performed')
  }
  // Template has ONE variable: {{1}} = patient name.
  const contentVariables = JSON.stringify({ 1: name })
  const body = new URLSearchParams({
    To: `whatsapp:${toE164}`,
    From: from,
    ContentSid: contentSid,
    ContentVariables: contentVariables,
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

exports.handler = async () => {
  if (!SUPABASE_SERVICE_KEY) {
    console.error('[send-reminders] SUPABASE_SERVICE_KEY not set')
    return { statusCode: 500, body: 'Supabase key missing' }
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

  const now = new Date()
  const winStart = new Date(now.getTime() + WINDOW_MIN_H * 3600e3)
  const winEnd = new Date(now.getTime() + WINDOW_MAX_H * 3600e3)
  // Pre-filter by date in the DB (today … +2 days covers the window across
  // midnight); precise datetime filtering happens in JS against the EC offset.
  const dayStr = (d) => d.toISOString().slice(0, 10)
  const fromDate = dayStr(now)
  const toDate = dayStr(new Date(now.getTime() + 48 * 3600e3))

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, fecha, hora_inicio, estado, reminder_sent_at, patient:patients(nombre, apellido, telefono)')
    .eq('estado', 'programada')
    .is('reminder_sent_at', null)
    .gte('fecha', fromDate)
    .lte('fecha', toDate)

  if (error) {
    console.error('[send-reminders] query error:', error.message)
    return { statusCode: 500, body: error.message }
  }

  const due = (sessions || []).filter((s) => {
    const start = new Date(`${s.fecha}T${(String(s.hora_inicio || '').slice(0, 8)) || '00:00:00'}${TZ_OFFSET}`)
    return start >= winStart && start < winEnd
  })
  console.log(`[send-reminders] now=${now.toISOString()} window=${WINDOW_MIN_H}-${WINDOW_MAX_H}h candidates=${sessions?.length || 0} due=${due.length}`)

  let sent = 0, failed = 0, skipped = 0
  for (const s of due) {
    const name = String(s.patient?.nombre || '').trim() || 'paciente'
    const toE164 = normalizePhone(s.patient?.telefono)
    if (!toE164) { skipped++; console.warn(`[send-reminders] skip session ${s.id}: un-normalizable phone`); continue }
    try {
      await sendWhatsAppReminder({ toE164, name })
      // Only mark AFTER a confirmed send (spec). If marking fails, we log it and
      // accept a possible re-send next hour rather than silently dropping it.
      const { error: upErr } = await supabase
        .from('sessions').update({ reminder_sent_at: new Date().toISOString() }).eq('id', s.id)
      if (upErr) { failed++; console.error(`[send-reminders] sent but mark failed for ${s.id}:`, upErr.message); continue }
      sent++
    } catch (e) {
      failed++
      console.error(`[send-reminders] send failed for session ${s.id}:`, e.message)
      // continue — one failure must not crash the batch
    }
  }

  console.log(`[send-reminders] done sent=${sent} failed=${failed} skipped=${skipped}`)
  return { statusCode: 200, body: JSON.stringify({ candidates: sessions?.length || 0, due: due.length, sent, failed, skipped }) }
}
