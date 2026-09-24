// Shared WhatsApp-reminder helpers for the modern Netlify Functions runtime.
// Used by the scheduled sender (send-reminders) and the HTTP test path in the
// inbound webhook (twilio-webhook). Framework-free: plain fetch + supabase-js.
//
// PROVIDER SWITCH (REMINDERS_PROVIDER): reminders go out via **Dualhook** (Cloud
// API proxy, approved template `recordatorio_cita`) by default. Set
// REMINDERS_PROVIDER=twilio to fall back to the legacy Twilio Content-API path —
// a one-env-var rollback, no code change or deploy. Twilio code below stays intact
// but dormant. NOTE the two halves move together: Dualhook reminders get their
// Confirmo/Cancelar replies at whatsapp-cloud-webhook.mjs; Twilio replies at
// twilio-webhook.mjs. Flip the provider and the inbound webhook (Meta vs Twilio
// number) must match.

import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vnityzpuhnkumsyfnskz.supabase.co'
export const TZ_OFFSET = '-05:00' // Ecuador, no DST (matches src/lib/queries.js)

// Dualhook Cloud-API send surface (same host/key/auth as the media-read two-hop in
// waMedia.mjs). Phone-number-id 915558374975708, WABA 1857507018469524. The
// approved reminder template mirrors the Twilio one: 3 body vars + Confirmo/Cancelar.
const DUALHOOK_SEND_URL = 'https://api.dualhook.com/v25.0/915558374975708/messages'
const REMINDER_TEMPLATE = 'recordatorio_cita'
const REMINDER_LANG = 'es'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// 'YYYY-MM-DD' → "23 de septiembre" (parsed by parts to avoid TZ drift). The
// template already says "mañana {{2}}", so this is just day + month name.
export function formatFechaEs(fechaStr) {
  const [, m, d] = String(fechaStr || '').split('-').map(Number)
  if (!m || !d) return String(fechaStr || '')
  return `${d} de ${MESES[m - 1] || ''}`.trim()
}

// 'HH:MM:SS' | 'HH:MM' → 'HH:MM'
export function formatHora(horaStr) {
  return String(horaStr || '').slice(0, 5)
}

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

// ── Dualhook (default provider) ─────────────────────────────────────────────
// Send one WhatsApp reminder via the Cloud-API template `recordatorio_cita`
// (3 body vars: {{1}} nombre, {{2}} fecha, {{3}} hora; quick replies Confirmo /
// Cancelar). Throws on any failure so the caller can decide how to react. The
// Dualhook key is read ONLY from env (WA_DUALHOOK_API_KEY, a dh_live_ secret).
export async function sendDualhookReminder({ toE164, name, fecha, hora }) {
  const apiKey = process.env.WA_DUALHOOK_API_KEY
  if (!apiKey) throw new Error('WA_DUALHOOK_API_KEY missing — no send performed')
  const to = String(toE164).replace(/^\+/, '') // Cloud API wants digits, no '+'
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: REMINDER_TEMPLATE,
      language: { code: REMINDER_LANG },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: name },
          { type: 'text', text: fecha },
          { type: 'text', text: hora },
        ],
      }],
    },
  }
  const res = await fetch(DUALHOOK_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Dualhook ${res.status}: ${await res.text()}`)
  return res.json()
}

// ── Payment reminder (Dualhook, template `recordatorio_pago`) ────────────────
// Sends the patient payment-reminder template (UTILITY, es). Body vars:
//   {{1}} nombre · {{2}} monto (owed, net of saldo a favor) · {{3}} sesiones text
//   (code-generated, e.g. "tu sesión del 22 de septiembre" / "las sesiones de
//   Micaela del 20 y 22 de septiembre").
// The template carries one URL button ("Pagar con tarjeta") whose URL is the
// DYNAMIC form https://ppls.me/{{1}} — we fill {{1}} with a Payphone link suffix
// so a per-patient link can replace the fixed one later WITHOUT resubmitting the
// template. Suffix comes from env PAYPHONE_LINK_SUFFIX (falls back to the current
// blank-amount link). Throws on any failure so the caller decides how to react.
// NOTE: deliberately references ONLY the new `recordatorio_pago` — the superseded
// pending template (old id 1871176587622662) must never be used.
const PAYMENT_TEMPLATE = 'recordatorio_pago'
const PAYMENT_LANG = 'es'
const DEFAULT_PAYPHONE_SUFFIX = 'r1NzJTGHRqrDZi1UJRm9w' // blank-amount link, 24 Sep 2026

export async function sendDualhookPaymentReminder({ toE164, name, monto, sesionesText, payphoneSuffix }) {
  const apiKey = process.env.WA_DUALHOOK_API_KEY
  if (!apiKey) throw new Error('WA_DUALHOOK_API_KEY missing — no send performed')
  const to = String(toE164).replace(/^\+/, '') // Cloud API wants digits, no '+'
  const suffix = payphoneSuffix || process.env.PAYPHONE_LINK_SUFFIX || DEFAULT_PAYPHONE_SUFFIX
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: PAYMENT_TEMPLATE,
      language: { code: PAYMENT_LANG },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: String(name) },
            { type: 'text', text: String(monto) },
            { type: 'text', text: String(sesionesText) },
          ],
        },
        {
          // Fills {{1}} in the button URL https://ppls.me/{{1}}
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: suffix }],
        },
      ],
    },
  }
  const res = await fetch(DUALHOOK_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Dualhook ${res.status}: ${await res.text()}`)
  return res.json()
}

// ── Twilio (legacy fallback, REMINDERS_PROVIDER=twilio) ──────────────────────
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
// re-send rather than silently dropping the reminder. Provider is chosen by
// REMINDERS_PROVIDER (default 'dualhook'); the signature is unchanged so
// send-reminders.mjs / the test path don't care which provider is live.
export async function deliverReminder(supabase, s) {
  const name = String(s.patient?.nombre || '').trim() || 'paciente'
  const toE164 = normalizePhone(s.patient?.telefono)
  if (!toE164) { console.warn(`[reminders] skip session ${s.id}: un-normalizable phone`); return 'skipped' }
  const provider = (process.env.REMINDERS_PROVIDER || 'dualhook').toLowerCase()
  try {
    if (provider === 'twilio') {
      await sendWhatsAppReminder({ toE164, name })
    } else {
      await sendDualhookReminder({
        toE164, name, fecha: formatFechaEs(s.fecha), hora: formatHora(s.hora_inicio),
      })
    }
    const { error: upErr } = await supabase
      .from('sessions').update({ reminder_sent_at: new Date().toISOString() }).eq('id', s.id)
    if (upErr) { console.error(`[reminders] sent but mark failed for ${s.id}:`, upErr.message); return 'failed' }
    return 'sent'
  } catch (e) {
    console.error(`[reminders] send failed for session ${s.id} via ${provider}:`, e.message)
    return 'failed'
  }
}

// ── Inbound reply → estado (shared by both webhooks) ─────────────────────────
const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)

// Map any reply string (quick-reply payload, button text, or typed message) to an
// estado. Accent/space/case-insensitive; matches the Dualhook buttons (Confirmo /
// Cancelar), typed variants, and the legacy Twilio payloads (confirmed/canceled).
export function resolveReplyEstado(raw) {
  const s = String(raw || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  if (!s) return null
  if (s.includes('confirm')) return 'confirmada'
  if (s.includes('cancel')) return 'cancelada'
  return null
}

// Flip the estado of a patient's soonest reminded 'programada' session from an
// inbound WhatsApp reply. Best-effort side-effects (Google Calendar soft-cancel +
// push) mirror the in-app and Twilio-webhook behaviour. Never throws — returns a
// small result object for logging. Used by whatsapp-cloud-webhook.mjs (Dualhook).
export async function applyInboundReplyEstado(supabase, fromRaw, estado, { notifyTherapist } = {}) {
  // 1. Match patient by phone: exact normalized E.164 OR last-9-digits.
  const { data: patients, error: pErr } = await supabase
    .from('patients').select('id, telefono, nombre, apellido')
  if (pErr) { console.error('[wa-reply] patients fetch:', pErr.message); return { ok: false } }
  const fromNorm = normalizePhone(fromRaw)
  const from9 = last9(fromRaw)
  const patient = (patients || []).find((p) => {
    const n = normalizePhone(p.telefono)
    return (fromNorm && n === fromNorm) || (from9 && last9(p.telefono) === from9)
  })
  if (!patient) { console.warn(`[wa-reply] no patient matched phone ${fromRaw}`); return { ok: false, reason: 'no_patient' } }

  // 2. Soonest upcoming, already-reminded 'programada' session for this patient.
  const today = new Date().toISOString().slice(0, 10)
  const { data: sess, error: sErr } = await supabase
    .from('sessions')
    .select('id, fecha, hora_inicio, google_event_id, terapeuta_id, therapist:therapists(calendar_email)')
    .eq('patient_id', patient.id)
    .eq('estado', 'programada')
    .not('reminder_sent_at', 'is', null)
    .gte('fecha', today)
    .order('fecha', { ascending: true })
    .order('hora_inicio', { ascending: true })
    .limit(1)
  if (sErr) { console.error('[wa-reply] sessions fetch:', sErr.message); return { ok: false } }
  const session = sess?.[0]
  if (!session) { console.warn(`[wa-reply] no reminded programada session for patient ${patient.id}`); return { ok: false, reason: 'no_session', patient } }

  // 3. Apply estado. A cancelled session never charges → clear pagado/paid_at.
  const patch = estado === 'cancelada' ? { estado, pagado: false, paid_at: null } : { estado }
  const { error: uErr } = await supabase.from('sessions').update(patch).eq('id', session.id)
  if (uErr) { console.error('[wa-reply] update failed:', uErr.message); return { ok: false } }
  console.log(`[wa-reply] session ${session.id} → ${estado} (patient ${patient.id})`)

  // 4. On cancellation, soft-cancel the Google Calendar event (best-effort).
  if (estado === 'cancelada' && session.therapist?.calendar_email && session.google_event_id) {
    const CALENDAR_FN = `${process.env.URL || 'https://efimeramente-panel.netlify.app'}/.netlify/functions/calendar`
    try {
      const res = await fetch(CALENDAR_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', calendarId: session.therapist.calendar_email, eventId: session.google_event_id }),
      })
      const j = await res.json().catch(() => ({}))
      if (j.success) console.log(`[wa-reply] calendar event ${session.google_event_id} cancelled`)
      else console.warn('[wa-reply] calendar cancel not successful:', j.error)
    } catch (e) {
      console.warn('[wa-reply] calendar cancel failed (non-blocking):', e.message)
    }
  }

  // 5. Push-notify the therapist + owner (best-effort). Caller injects notifyTherapist.
  if (typeof notifyTherapist === 'function') {
    const patientName = [patient.nombre, patient.apellido].filter(Boolean).join(' ') || 'Paciente'
    const [, mm, dd] = String(session.fecha).split('-')
    await notifyTherapist(supabase, session.terapeuta_id, {
      title: estado === 'confirmada' ? 'Sesión confirmada ✅' : 'Sesión cancelada ❌',
      body: `${patientName} — ${dd}/${mm} ${formatHora(session.hora_inicio)}`,
      url: '/sesiones',
    })
  }

  return { ok: true, patient, session, estado }
}
