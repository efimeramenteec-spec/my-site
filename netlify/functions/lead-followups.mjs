// netlify/functions/lead-followups.mjs
//
// Modern Netlify SCHEDULED Function — every 15 min (cron in-code). Drives the four
// time-based lead-funnel follow-ups (#20):
//   A. Silent-nudge  — resume a mid-flow lead at +2h then +22h; 2nd → stage=frio.
//                      No sends 21:00–08:00 GYE (shift to the next in-hours run).
//   B. Call reminder — recordatorio_llamada to the lead ~1h before the call.
//   C. Call result   — resultado_llamada to the therapist ~5 min after it ends.
//   D. 48h nudge     — primera_sesion to the lead if the call happened but they
//                      haven't converted (session.convirtio still false) after 48h.
// The no-show rebook is INBOUND-triggered (therapist taps "No contestó" →
// whatsapp-cloud-webhook → handleTherapistResult), not a cron job.
//
// KILL-SWITCH: per-lead gate — sends when LEAD_BOT_LIVE === 'true' OR the lead's
// phone is in LEAD_BOT_TEST_PHONES (test mode). Everyone else is a dry run that
// logs eligible counts and touches nothing. Never touches `convirtio` (read-only).
//
// Scheduled functions aren't HTTP-invocable — trigger from the Netlify UI
// (Functions → lead-followups → Run now) to test the batch (respects the switch).

import { getSupabaseAdmin, TZ_OFFSET, formatHora } from '../lib/whatsapp.mjs'
import { nudgeLead, sendReminderForLead, sendResultForLead, sendFirstSessionForLead, botAllowedForPhone } from '../lib/leadBot.mjs'

export const config = { schedule: '*/15 * * * *' }

const H = 3600e3
const MIN = 60e3
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

const startAt = (s) => new Date(`${s.fecha}T${String(s.hora_inicio || '').slice(0, 8) || '00:00:00'}${TZ_OFFSET}`)
const endAt = (s) => new Date(`${s.fecha}T${String(s.hora_fin || '').slice(0, 8) || '00:00:00'}${TZ_OFFSET}`)

async function mapById(supabase, table, cols, ids) {
  const uniq = [...new Set(ids.filter(Boolean))]
  if (!uniq.length) return new Map()
  const { data } = await supabase.from(table).select(cols).in('id', uniq)
  return new Map((data || []).map((r) => [r.id, r]))
}

export default async () => {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    console.error('[followups] SUPABASE_SERVICE_KEY not set')
    return new Response('Supabase key missing', { status: 500 })
  }

  const now = new Date()
  const live = process.env.LEAD_BOT_LIVE === 'true'
  // Ecuador local hour (UTC-5, no DST). Quiet hours = 21:00–07:59 → skip the
  // marketing-y nudges (A, D); the time-critical B/C run regardless (they only
  // ever fall in business hours anyway).
  const ecHour = (now.getUTCHours() + 24 - 5) % 24
  const quiet = ecHour >= 21 || ecHour < 8

  const counts = { nudge: 0, reminder: 0, result: 0, nudge48: 0 }
  // Per-LEAD gate: send when globally live OR the lead's phone is in the test
  // allow-list. Job C sends to the therapist but is gated on the LEAD's phone so
  // a test lead's result still reaches the therapist. Real leads stay dark.
  const act = (lead, fn) => (botAllowedForPhone(lead.phone) ? fn() : Promise.resolve('dry'))

  // ── A. Silent nudges ────────────────────────────────────────────────────────
  if (!quiet) {
    const { data: leadsA } = await supabase.from('leads').select('*')
      .eq('bot_paused', false).not('step_actual', 'is', null)
      .in('stage', ['nuevo', 'toco', 'eligio_terapeuta']).lt('nudges_sent', 2)
    for (const lead of leadsA || []) {
      if (!lead.last_bot_at) continue
      const age = now.getTime() - new Date(lead.last_bot_at).getTime()
      const threshold = (lead.nudges_sent || 0) === 0 ? 2 * H : 20 * H // +2h, then +22h total
      if (age < threshold) continue
      const r = await act(lead, () => nudgeLead(supabase, lead))
      if (r === 'sent') counts.nudge++
      else if (r === 'dry') counts.nudge++
    }
  }

  // ── B. Call reminders (~1h before) ────────────────────────────────────────────
  {
    const { data: leadsB } = await supabase.from('leads').select('*')
      .eq('bot_paused', false).not('session_id', 'is', null)
      .is('recordatorio_llamada_at', null).eq('stage', 'agendo')
    const sessions = await mapById(supabase, 'sessions',
      'id, fecha, hora_inicio, hora_fin, estado, tipo, terapeuta_id', (leadsB || []).map((l) => l.session_id))
    const therapists = await mapById(supabase, 'therapists', 'id, nombre, telefono',
      (leadsB || []).map((l) => l.therapist_id))
    for (const lead of leadsB || []) {
      const s = sessions.get(lead.session_id)
      const t = therapists.get(lead.therapist_id)
      if (!s || !t || s.estado === 'cancelada' || s.tipo !== 'llamada') continue
      const untilStart = startAt(s).getTime() - now.getTime()
      // Window [50, 75] min before start; a call booked <1h out never enters it.
      if (untilStart < 50 * MIN || untilStart > 75 * MIN) continue
      const r = await act(lead, () => sendReminderForLead(supabase, lead, t, formatHora(s.hora_inicio)))
      if (r === 'sent' || r === 'dry') counts.reminder++
    }
  }

  // ── C. Therapist result (~5 min after end) ───────────────────────────────────
  {
    const { data: leadsC } = await supabase.from('leads').select('*')
      .not('session_id', 'is', null).is('resultado_llamada_at', null).eq('stage', 'agendo')
    const sessions = await mapById(supabase, 'sessions',
      'id, fecha, hora_inicio, hora_fin, estado, tipo, terapeuta_id', (leadsC || []).map((l) => l.session_id))
    const therapists = await mapById(supabase, 'therapists', 'id, nombre, telefono',
      (leadsC || []).map((l) => l.therapist_id))
    for (const lead of leadsC || []) {
      const s = sessions.get(lead.session_id)
      const t = therapists.get(lead.therapist_id)
      if (!s || !t || s.estado === 'cancelada' || s.tipo !== 'llamada') continue
      const sinceEnd = now.getTime() - endAt(s).getTime()
      // Ended between 5 and 90 min ago (90 covers a couple of missed cron ticks).
      if (sinceEnd < 5 * MIN || sinceEnd > 90 * MIN) continue
      const r = await act(lead, () => sendResultForLead(supabase, lead, t, formatHora(s.hora_inicio)))
      if (r === 'sent' || r === 'dry') counts.result++
    }
  }

  // ── D. 48h first-session nudge ────────────────────────────────────────────────
  if (!quiet) {
    const { data: leadsD } = await supabase.from('leads').select('*')
      .eq('bot_paused', false).eq('stage', 'llamada_hecha')
      .is('nudge48_sent_at', null).not('llamada_hecha_at', 'is', null)
    const sessions = await mapById(supabase, 'sessions', 'id, convirtio', (leadsD || []).map((l) => l.session_id))
    const therapists = await mapById(supabase, 'therapists', 'id, nombre, telefono', (leadsD || []).map((l) => l.therapist_id))
    for (const lead of leadsD || []) {
      if (now.getTime() - new Date(lead.llamada_hecha_at).getTime() < 48 * H) continue
      const s = lead.session_id ? sessions.get(lead.session_id) : null
      if (s?.convirtio === true) continue // converted already — don't nudge (never touch convirtio)
      const t = therapists.get(lead.therapist_id)
      if (!t) continue
      const r = await act(lead, () => sendFirstSessionForLead(supabase, lead, t))
      if (r === 'sent' || r === 'dry') counts.nudge48++
    }
  }

  const test = !!(process.env.LEAD_BOT_TEST_PHONES || '').trim()
  console.log(`[followups] live=${live} test=${test} ecHour=${ecHour} quiet=${quiet} ${JSON.stringify(counts)}`)
  return json({ live, test, quiet, ...counts })
}
