// netlify/lib/sesionesPendientes.mjs
//
// #52 — Past sessions can't stay in Pendiente. Every day at 08:30 GYE
// (functions/sesiones-pendientes.mjs) each therapist gets ONE WhatsApp per past
// session of theirs still in estado 'programada', with [Ocurrió] [No ocurrió].
// Their tap (whatsapp-cloud-webhook → handleEstadoTap) collapses the session to
// confirmada / cancelada. Nothing here ever changes an estado without that tap.
//
// Scope: estado 'programada' AND tipo <> 'llamada' AND fecha < today (GYE),
// therapist activo with a telefono. Llamadas are ALWAYS excluded (their estado is
// legacy, see CLAUDE.md) — filtered in the query AND re-checked in code.
//
// Per stuck session (ordered by therapist, fecha, hora):
//   therapist's 24h window open (inbound from their phone < 24h − 5 min) → free-form
//     interactive message, reply ids est_ok:/est_no:<id> (sendStaffButtons — no
//     sanitizer, the 🐚✨ signature stays);
//   closed → template sesion_pendiente (only once APPROVED as UTILITY), quick-reply
//     payloads est_ok:/est_no:<id>;
//   template not approved / send failed → ONE Web Push per therapist per day, to
//     that therapist only (skipOwner).
// Each send is logged in session_estado_reminders. A session reminded on 3
// different days with no answer → notifyOwner once (owner outbox, #45); the
// therapist keeps getting reminded daily after that.
//
// Every external effect goes through `deps` (and DB access through `repo`) so the
// harness can stub WhatsApp, template status, push, calendar and Supabase.

import { normalizePhone, formatFechaEs, formatHora } from './whatsapp.mjs'
import { sendText, sendStaffButtons } from './waSend.mjs'
import { notifyTherapist } from './push.mjs'
import { notifyOwner, windowOpen } from './ownerOutbox.mjs'
import { listTemplates, sendSesionPendiente, SESION_PENDIENTE_TEMPLATE, SESION_PENDIENTE_BODY, STAFF_TEMPLATES } from './leadTemplates.mjs'
import { patientLabel } from '../../src/lib/format.js'

const TABLE = 'session_estado_reminders'
const ESCALATE_AFTER_DAYS = 3
const GYE_OFFSET_MS = 5 * 3600 * 1000 // America/Guayaquil = UTC−5, no DST
const NICKNAMES = { Daniela: 'Dani' }

const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)
export const gyeDate = (d) => new Date(new Date(d).getTime() - GYE_OFFSET_MS).toISOString().slice(0, 10)
export const therapistNombre = (t) => NICKNAMES[t?.nombre] || t?.nombre || ''

// Free-form body = the template body with its three variables filled in.
export function buildBody({ nombre, paciente, fecha }) {
  return SESION_PENDIENTE_BODY.replace('{{1}}', nombre).replace('{{2}}', paciente).replace('{{3}}', fecha)
}

export function pushBody(n) {
  return n === 1
    ? 'Tienes 1 sesión en Pendiente. Ábrela en Sesiones para marcarla.'
    : `Tienes ${n} sesiones en Pendiente. Ábrelas en Sesiones para marcarlas.`
}

// ── DB access (production) ────────────────────────────────────────────────────
const SESSION_SELECT = 'id, fecha, hora_inicio, tipo, estado, google_event_id, terapeuta_id, ' +
  'patient:patients(nombre, apellido, nombre_2, apellido_2, tipo_paciente), ' +
  'therapist:therapists(id, nombre, apellido, telefono, activo, calendar_email)'

export function supabaseRepo(supabase) {
  return {
    async stuckSessions(today) {
      const { data, error } = await supabase.from('sessions').select(SESSION_SELECT)
        .eq('estado', 'programada').neq('tipo', 'llamada').lt('fecha', today)
        .order('terapeuta_id').order('fecha').order('hora_inicio')
      if (error) throw new Error('stuck sessions query failed: ' + error.message)
      return data || []
    },
    async getSession(id) {
      const { data, error } = await supabase.from('sessions').select(SESSION_SELECT).eq('id', id).maybeSingle()
      if (error) throw new Error('session lookup failed: ' + error.message)
      return data || null
    },
    async lastInbound(phone) {
      const { data, error } = await supabase.from('whatsapp_messages')
        .select('received_at').eq('direccion', 'inbound')
        .like('raw_payload->message->>from', `%${last9(phone)}`)
        .order('received_at', { ascending: false }).limit(1)
      if (error) throw new Error('inbound lookup failed: ' + error.message)
      return data?.[0]?.received_at || null
    },
    async remindersFor(sessionIds) {
      if (!sessionIds.length) return []
      const { data, error } = await supabase.from(TABLE).select('*').in('session_id', sessionIds)
      if (error) throw new Error('reminders read failed: ' + error.message)
      return data || []
    },
    async insertReminder(row) {
      const { data, error } = await supabase.from(TABLE).insert(row).select().single()
      if (error) throw new Error('reminder insert failed: ' + error.message)
      return data
    },
    async markEscalated(reminderId, at) {
      await supabase.from(TABLE).update({ escalated_at: at }).eq('id', reminderId)
    },
    async stampRespuesta(sessionId, respuesta, at) {
      await supabase.from(TABLE).update({ respuesta, respondida_at: at })
        .eq('session_id', sessionId).is('respuesta', null)
    },
    // Same server-side write path as the Twilio/Dualhook patient reply
    // (whatsapp.mjs#applyInboundReplyEstado): a plain service-role UPDATE, so the
    // sessions triggers (consume_saldo_on_confirm, lead/patient links) fire as
    // usual. Guarded on estado='programada' → returns false if already closed.
    async closeSession(id, estado) {
      const patch = estado === 'cancelada' ? { estado, pagado: false, paid_at: null } : { estado }
      const { data, error } = await supabase.from('sessions').update(patch)
        .eq('id', id).eq('estado', 'programada').select('id')
      if (error) throw new Error('session update failed: ' + error.message)
      return !!data?.length
    },
  }
}

// ── Default external effects ──────────────────────────────────────────────────
async function templateApproved() {
  const out = await listTemplates()
  const t = (out.templates || []).find((x) => x.name === SESION_PENDIENTE_TEMPLATE)
  const want = STAFF_TEMPLATES.find((x) => x.name === SESION_PENDIENTE_TEMPLATE).category
  return !!t && t.status === 'APPROVED' && t.category === want
}

async function cancelCalendar(calendarId, eventId) {
  const fn = `${process.env.URL || 'https://efimeramente-panel.netlify.app'}/.netlify/functions/calendar`
  const res = await fetch(fn, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cancel', calendarId, eventId }),
  })
  const j = await res.json().catch(() => ({}))
  if (!j.success) throw new Error(j.error || `calendar ${res.status}`)
}

export const defaultDeps = {
  sendStaffButtons, sendSesionPendiente, sendText, notifyTherapist, notifyOwner,
  templateApproved, cancelCalendar, now: () => new Date(),
}

// ── Daily run ─────────────────────────────────────────────────────────────────
export async function runSesionesPendientes(supabase, { repo = supabaseRepo(supabase), deps = defaultDeps } = {}) {
  const now = deps.now()
  const today = gyeDate(now)
  const nowIso = now.toISOString()

  const all = await repo.stuckSessions(today)
  // Belt and braces on the scope (stop conditions: never a llamada, never today/future).
  const stuck = all.filter((s) => s.tipo !== 'llamada' && s.estado === 'programada' && s.fecha < today)
  const ignoredLlamadas = all.length - stuck.length
  if (ignoredLlamadas) console.error(`[pendientes] ${ignoredLlamadas} out-of-scope row(s) returned by the query — skipped`)

  const reminders = await repo.remindersFor(stuck.map((s) => s.id))
  const bySession = new Map()
  for (const r of reminders) {
    if (!bySession.has(r.session_id)) bySession.set(r.session_id, [])
    bySession.get(r.session_id).push(r)
  }

  let approved = null // lazily fetched once per run
  const isApproved = async () => {
    if (approved === null) {
      try { approved = await deps.templateApproved() } catch (e) { console.warn('[pendientes] template status failed:', e.message); approved = false }
    }
    return approved
  }

  // Group by therapist (query order is kept inside each group).
  const groups = new Map()
  for (const s of stuck) {
    const t = s.therapist
    if (!t?.activo || !normalizePhone(t.telefono)) continue
    if (!groups.has(t.id)) groups.set(t.id, { therapist: t, sessions: [] })
    groups.get(t.id).sessions.push(s)
  }

  const report = { today, therapists: [], escalated: [] }
  for (const { therapist: t, sessions } of groups.values()) {
    const to = normalizePhone(t.telefono)
    const nombre = therapistNombre(t)
    const tr = { terapeuta: t.nombre, total: sessions.length, free: 0, template: 0, push: 0, skippedToday: 0, sessions: [] }
    let lastIn = null
    try { lastIn = await repo.lastInbound(to) } catch (e) { console.warn('[pendientes] inbound lookup:', e.message) }
    const open = windowOpen(lastIn, now)
    const needPush = []

    for (const s of sessions) {
      const prior = bySession.get(s.id) || []
      if (prior.some((r) => gyeDate(r.sent_at) === today)) { tr.skippedToday++; continue } // already reminded today
      const paciente = patientLabel(s.patient)
      const fecha = formatFechaEs(s.fecha)
      let canal = null, wamid = null
      try {
        if (open) {
          wamid = await deps.sendStaffButtons(to, buildBody({ nombre, paciente, fecha }), [
            { id: `est_ok:${s.id}`, title: 'Ocurrió' },
            { id: `est_no:${s.id}`, title: 'No ocurrió' },
          ])
          canal = 'free'
        } else if (await isApproved()) {
          wamid = await deps.sendSesionPendiente(to, { nombre, paciente, fecha, sessionId: s.id })
          canal = 'template'
        }
      } catch (e) {
        console.warn(`[pendientes] send failed for session ${s.id}:`, e.message)
      }
      if (!canal) { needPush.push(s); continue }
      const row = await repo.insertReminder({ session_id: s.id, terapeuta_id: t.id, sent_at: nowIso, canal, wamid })
      prior.push(row); bySession.set(s.id, prior)
      tr[canal]++
      tr.sessions.push({ id: s.id, fecha: s.fecha, hora: formatHora(s.hora_inicio), paciente, canal })
    }

    if (needPush.length) {
      await deps.notifyTherapist(supabase, t.id, { title: 'Sesiones en Pendiente', body: pushBody(sessions.length), url: '/sesiones' }, { skipOwner: true })
      for (const s of needPush) {
        const row = await repo.insertReminder({ session_id: s.id, terapeuta_id: t.id, sent_at: nowIso, canal: 'push', wamid: null })
        const prior = bySession.get(s.id) || []; prior.push(row); bySession.set(s.id, prior)
        tr.push++
        tr.sessions.push({ id: s.id, fecha: s.fecha, hora: formatHora(s.hora_inicio), paciente: patientLabel(s.patient), canal: 'push' })
      }
    }

    // Escalation: reminded on ≥3 different days, never answered, not yet escalated.
    for (const s of sessions) {
      const rows = bySession.get(s.id) || []
      if (rows.some((r) => r.escalated_at) || rows.some((r) => r.respuesta)) continue
      const days = new Set(rows.map((r) => gyeDate(r.sent_at)))
      if (days.size < ESCALATE_AFTER_DAYS) continue
      const todayRow = rows.find((r) => gyeDate(r.sent_at) === today) || rows[rows.length - 1]
      const resumen = `Sesión sin cerrar: ${t.nombre} · ${patientLabel(s.patient)} · ${formatFechaEs(s.fecha)} (${days.size} recordatorios)`
      try {
        await deps.notifyOwner(supabase, { kind: 'sesion_sin_cerrar', resumen, messages: [{ type: 'text', body: resumen }] })
        await repo.markEscalated(todayRow.id, nowIso)
        todayRow.escalated_at = nowIso
        report.escalated.push(s.id)
      } catch (e) { console.warn(`[pendientes] escalation failed for ${s.id}:`, e.message) }
    }
    report.therapists.push(tr)
  }
  return report
}

// ── Webhook: the therapist's tap ──────────────────────────────────────────────
// est_ok:<uuid> / est_no:<uuid>, from a reply button (interactive.button_reply.id)
// or a template quick reply (button.payload).
const TAP_RE = /^est_(ok|no):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
export function parseEstadoTap(msg) {
  const raw = msg?.type === 'button' ? msg.button?.payload
    : msg?.type === 'interactive' ? msg.interactive?.button_reply?.id : null
  const m = TAP_RE.exec(String(raw || '').trim())
  return m ? { action: m[1].toLowerCase(), sessionId: m[2].toLowerCase() } : null
}

// Returns true when the message was an est_* tap (consumed — never reaches the
// estado/lead-bot paths), false otherwise. No Web Push: the therapist acted.
export async function handleEstadoTap(supabase, msg, { repo = supabaseRepo(supabase), deps = defaultDeps } = {}) {
  const tap = parseEstadoTap(msg)
  if (!tap) return false
  const s = await repo.getSession(tap.sessionId)
  if (!s) { console.warn(`[pendientes] tap for unknown session ${tap.sessionId} — ignored`); return true }
  const t9 = last9(s.therapist?.telefono)
  if (!t9 || last9(msg.from) !== t9) { console.warn(`[pendientes] tap on ${s.id} from non-therapist ${msg.from} — ignored`); return true }
  if (s.tipo === 'llamada') { console.warn(`[pendientes] tap on llamada ${s.id} — ignored`); return true }

  const estado = tap.action === 'ok' ? 'confirmada' : 'cancelada'
  const changed = s.estado === 'programada' && await repo.closeSession(s.id, estado)
  if (!changed) { await deps.sendText(msg.from, 'Esa sesión ya estaba cerrada.'); return true }
  console.log(`[pendientes] session ${s.id} → ${estado} (therapist tap)`)

  await repo.stampRespuesta(s.id, tap.action === 'ok' ? 'ocurrio' : 'no_ocurrio', deps.now().toISOString())
  if (estado === 'cancelada' && s.therapist?.calendar_email && s.google_event_id) {
    try { await deps.cancelCalendar(s.therapist.calendar_email, s.google_event_id) }
    catch (e) { console.warn('[pendientes] calendar cancel failed (non-blocking):', e.message) }
  }
  await deps.sendText(msg.from, estado === 'confirmada' ? 'Listo, quedó como Confirmada.' : 'Listo, quedó como Cancelada.')
  return true
}
