// netlify/lib/reminderSends.mjs
//
// #86 C (22 Oct 2026) — a failed reminder must not count as sent.
// A Dualhook 200 only means "accepted"; Meta can still report `failed` seconds later
// (131026 undeliverable = wrong/non-WhatsApp number, 131049, …). Before #86 the
// session stayed stamped (recordatorio_pago_at / reminder_sent_at) and nobody knew.
//
//   • Every accepted reminder is logged in `reminder_sends` (kind 'pago' | 'cita',
//     wamid, the sessions it stamped, the phone). A rejected send (throw) stamps nothing.
//   • reconcileReminderFailures(): any logged wamid with a `failed` row in
//     whatsapp_delivery_status → the stamp is cleared on those sessions, failed_at +
//     error recorded, and ONE notifyOwner (kind 'recordatorio_fallido': patient,
//     number, error). Called by the webhook as soon as the status arrives AND at the
//     start of each reminder run (catches a status that beat the log insert).
//   • failedBefore(): a session already failed on THIS number is not retried (no
//     daily resend + owner ping to a dead number); fixing the phone re-enables it.
//
// All DB access goes through `repo` so the harness can run it in memory.

import { notifyOwner as realNotifyOwner } from './ownerOutbox.mjs'

const STAMP = { pago: 'recordatorio_pago_at', cita: 'reminder_sent_at' }
const LABEL = { pago: 'pago', cita: 'cita' }
const LOOKBACK_DAYS = 14

export const wamidOf = (resp) => resp?.messages?.[0]?.id || null

export function supabaseRepo(supabase) {
  return {
    async insertSend(row) {
      const { error } = await supabase.from('reminder_sends').insert(row)
      if (error) throw new Error('reminder_sends insert: ' + error.message)
    },
    async failedSends({ kind, telefono }) {
      const { data, error } = await supabase.from('reminder_sends').select('session_ids')
        .eq('kind', kind).eq('telefono', telefono).not('failed_at', 'is', null)
      if (error) throw new Error('reminder_sends failed lookup: ' + error.message)
      return data || []
    },
    async unreconciled({ wamids, since }) {
      let q = supabase.from('reminder_sends').select('id, kind, wamid, patient_id, session_ids, telefono')
        .is('failed_at', null).not('wamid', 'is', null)
      q = wamids ? q.in('wamid', wamids) : q.gte('sent_at', since)
      const { data, error } = await q
      if (error) throw new Error('reminder_sends unreconciled: ' + error.message)
      return data || []
    },
    async failedStatuses(wamids) {
      const { data, error } = await supabase.from('whatsapp_delivery_status')
        .select('wamid, error_code, error_title, error_message').eq('status', 'failed').in('wamid', wamids)
      if (error) throw new Error('delivery status lookup: ' + error.message)
      return data || []
    },
    async clearStamp(kind, sessionIds) {
      const col = STAMP[kind]
      const { error } = await supabase.from('sessions').update({ [col]: null }).in('id', sessionIds).not(col, 'is', null)
      if (error) throw new Error('clear stamp: ' + error.message)
    },
    // Atomic claim: only the first reconciler of a row notifies.
    async claimFailed(id, { at, error: err }) {
      const { data, error } = await supabase.from('reminder_sends')
        .update({ failed_at: at, error: err, owner_notified_at: at }).eq('id', id).is('failed_at', null).select('id')
      if (error) throw new Error('reminder_sends claim: ' + error.message)
      return !!data?.length
    },
    async patientName(id) {
      if (!id) return null
      const { data } = await supabase.from('patients').select('nombre, apellido, nombre_2, tipo_paciente').eq('id', id).maybeSingle()
      if (!data) return null
      const first = data.tipo_paciente === 'menor' && data.nombre_2 ? data.nombre_2 : data.nombre
      return [first, data.apellido].filter(Boolean).join(' ') || null
    },
  }
}

// Log an accepted send. Best-effort: a failed log must never undo or block a send.
export async function logReminderSend(repo, { kind, resp, patientId, sessionIds, telefono }) {
  try {
    await repo.insertSend({
      kind, wamid: wamidOf(resp), patient_id: patientId || null, session_ids: sessionIds, telefono,
    })
  } catch (e) { console.warn('[reminder-sends] log failed (non-blocking):', e.message) }
}

// True when any of these sessions already had a reminder of this kind fail on this number.
export async function failedBefore(repo, { kind, telefono, sessionIds }) {
  if (!telefono) return false
  const rows = await repo.failedSends({ kind, telefono })
  const want = new Set(sessionIds)
  return rows.some((r) => (r.session_ids || []).some((id) => want.has(id)))
}

const errText = (f) => [f.error_code, f.error_title || f.error_message].filter(Boolean).join(' ') || 'failed'

// wamids given → only those (webhook); else every unreconciled send of the last 14 days.
export async function reconcileReminderFailures(repo, { wamids = null, now = new Date(), notifyOwner } = {}) {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86400e3).toISOString()
  const sends = await repo.unreconciled({ wamids, since })
  if (!sends.length) return { failed: 0 }
  const fails = await repo.failedStatuses(sends.map((s) => s.wamid))
  let failed = 0
  for (const s of sends) {
    const f = fails.find((x) => x.wamid === s.wamid)
    if (!f) continue
    const error = errText(f)
    if (!(await repo.claimFailed(s.id, { at: now.toISOString(), error }))) continue
    failed++
    try { await repo.clearStamp(s.kind, s.session_ids || []) }
    catch (e) { console.error('[reminder-sends] clear stamp failed:', e.message) }
    const name = (await repo.patientName(s.patient_id).catch(() => null)) || 'paciente sin identificar'
    const body = `⚠️ Recordatorio de ${LABEL[s.kind]} NO entregado\n${name} · ${s.telefono || 'sin número'}\nError: ${error}\n\n` +
      'Lo des-marqué (no cuenta como enviado) y no se reintenta a ese número. Revisa el teléfono en Pacientes.'
    try {
      await notifyOwner({ kind: 'recordatorio_fallido', resumen: `Recordatorio no entregado: ${name}`.slice(0, 100), messages: [{ type: 'text', body }] })
    } catch (e) { console.error('[reminder-sends] notifyOwner failed:', e.message) }
  }
  return { failed }
}

// Production entry point (webhook + crons). Never throws.
export async function reconcileWithSupabase(supabase, opts = {}) {
  try {
    return await reconcileReminderFailures(supabaseRepo(supabase), {
      ...opts, notifyOwner: (o) => realNotifyOwner(supabase, o),
    })
  } catch (e) {
    console.error('[reminder-sends] reconcile failed:', e.message)
    return { failed: 0, error: e.message }
  }
}
