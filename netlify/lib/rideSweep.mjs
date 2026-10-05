// netlify/lib/rideSweep.mjs
//
// RIDE sweep (#47). Every 15 min (factura-rides-sweep.mjs) WhatsApp the RIDE of
// every invoiced session that hasn't been sent yet, as soon as the SRI authorizes
// it. This is the ONLY automatic RIDE path: Aprobar (facturarAprobacion.mjs) emits
// and replies at once; it never sends a RIDE itself.
//
// Candidates = ridePlan(…, { floor: true }): facturada = true AND contifico_doc_id
// set AND factura_enviada_at IS NULL AND fecha >= coalesce(facturar_desde,
// FACTURAR_SINCE). Sending reuses sendRides (same factura_sesion_link template,
// same recipient rule, same factura_enviada_at stamp).
//
// Double-send guard: before sending, the sweep atomically flips
// factura_ride_sweep.claimed_at NULL→now for the session. A claimed row is never
// sent again by the sweep — even if the stamp failed after a successful send. A
// failed send (nothing delivered) releases the claim so the next sweep retries.
//
// 48h alert: first_seen_at (the first sweep that saw the session unsent ≈ its
// emission time; Contífico gives no emission hour) + 48h with the doc still not
// SRI-authorized → ONE notifyOwner "Factura {documento} sigue sin autorización del
// SRI" (atomic sri_alert_at NULL→now flip, so exactly once per doc).
//
// Every external effect goes through `deps` so the harness can stub Contífico,
// WhatsApp and the owner outbox; production always uses the defaults below.

import { ridePlan, sendRides } from './facturarCore.mjs'
import { notifyOwner } from './ownerOutbox.mjs'

const TABLE = 'factura_ride_sweep'
const ALERT_MS = 48 * 3600 * 1000
const UNAUTHORIZED = 'not yet SRI-authorized'

const defaultDeps = { ridePlan, sendRides, notifyOwner, now: () => new Date() }

export async function sweepRides(supabase, deps = defaultDeps) {
  const plan = await deps.ridePlan(supabase, null, { floor: true })
  const out = { candidates: plan.length, sent: 0, failed: 0, waiting_sri: 0, other_blocked: 0,
    already_claimed: 0, alerts: 0, results: [] }
  if (!plan.length) return out

  const ids = plan.map((p) => p.session_id)
  const { error: upErr } = await supabase.from(TABLE)
    .upsert(plan.map((p) => ({ session_id: p.session_id, documento: p.documento })),
      { onConflict: 'session_id', ignoreDuplicates: true })
  if (upErr) throw new Error('ride sweep upsert failed: ' + upErr.message)
  const { data: rows, error: selErr } = await supabase.from(TABLE)
    .select('session_id, first_seen_at').in('session_id', ids)
  if (selErr) throw new Error('ride sweep select failed: ' + selErr.message)
  const firstSeen = new Map((rows || []).map((r) => [r.session_id, r.first_seen_at]))

  for (const item of plan) {
    const nowIso = deps.now().toISOString()
    if (item.ready) {
      // eslint-disable-next-line no-await-in-loop
      const { data: claimed, error } = await supabase.from(TABLE)
        .update({ claimed_at: nowIso, documento: item.documento })
        .eq('session_id', item.session_id).is('claimed_at', null).select('session_id')
      if (error) throw new Error('ride sweep claim failed: ' + error.message)
      if (!claimed?.length) { out.already_claimed++; continue }

      // eslint-disable-next-line no-await-in-loop
      const [r] = await deps.sendRides(supabase, [item])
      out.results.push(r)
      if (!r?.sent) {
        out.failed++
        // Nothing was delivered → release so the next sweep retries.
        // eslint-disable-next-line no-await-in-loop
        await supabase.from(TABLE).update({ claimed_at: null }).eq('session_id', item.session_id)
        continue
      }
      out.sent++
      // eslint-disable-next-line no-await-in-loop
      if (r.stamped) await supabase.from(TABLE).update({ sent_at: nowIso }).eq('session_id', item.session_id)
      else console.error(`[ride-sweep] ${item.documento} SENT but not stamped — claim kept, never re-sent: ${r.error}`)
      continue
    }

    if (!item.blocking.includes(UNAUTHORIZED)) { out.other_blocked++; continue }
    out.waiting_sri++
    const seen = firstSeen.get(item.session_id)
    if (!seen || deps.now().getTime() - new Date(seen).getTime() < ALERT_MS) continue
    // eslint-disable-next-line no-await-in-loop
    const { data: flipped, error } = await supabase.from(TABLE)
      .update({ sri_alert_at: nowIso })
      .eq('session_id', item.session_id).is('sri_alert_at', null).select('session_id')
    if (error) throw new Error('ride sweep alert flip failed: ' + error.message)
    if (!flipped?.length) continue
    const body = `Factura ${item.documento} sigue sin autorización del SRI`
    // eslint-disable-next-line no-await-in-loop
    await deps.notifyOwner(supabase, { kind: 'sri', resumen: body, messages: [{ type: 'text', body }] })
    out.alerts++
  }
  return out
}
