// netlify/lib/broadcast.mjs
//
// #53 — Reusable WhatsApp broadcasts (tables broadcasts + broadcast_recipients,
// supabase/broadcasts.sql). First use: telling Mariana's active patients she is
// taking sessions again.
//
// Lifecycle: borrador → filtrando (the therapist reviews the numbered list and
// says who to leave out → excluido=true) → listo → enviado.
//
// runBroadcastSweep (functions/broadcast-sweep.mjs, */15) sends every recipient of
// a 'listo' broadcast that isn't excluded and hasn't been claimed, ONLY between
// 08:00 and 21:00 GYE:
//   patient's 24h window open (inbound from their phone < 24h − 5 min) → free-form
//     text = broadcasts.body with {{1}} = saludo (sendStaffText, no sanitizer);
//   closed → template broadcasts.template_name once Meta APPROVES it (any category);
//   not approved → the recipient waits for a later run (not claimed).
// Atomic claim (claimed_at null → now) BEFORE the send; a claimed row is never sent
// again, even if the send failed — the failure goes in `error` instead.
// Meta reports some failures only asynchronously (e.g. 131049, the per-user
// marketing cap) as a 'failed' delivery status → reconciled from
// whatsapp_delivery_status by wamid. When nothing is left to send and the last send
// is ≥30 min old, the broadcast → 'enviado' and notifyOwner fires ONCE with the
// people who didn't get it, so Nicolás can send it by hand.
//
// Every external effect goes through `deps` so a harness can stub them.

import { sendStaffText } from './waSend.mjs'
import { notifyOwner, windowOpen } from './ownerOutbox.mjs'
import { listTemplates, sendBroadcastTemplate } from './leadTemplates.mjs'

const GYE_OFFSET_MS = 5 * 3600 * 1000 // America/Guayaquil = UTC−5, no DST
const SEND_HOURS = [8, 21] // [from, to) GYE
const MAX_SENDS_PER_RUN = 25 // keeps a run well inside the function time limit
const SETTLE_MS = 30 * 60 * 1000 // wait for async 'failed' statuses before closing

export const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)
export const gyeHour = (d) => new Date(new Date(d).getTime() - GYE_OFFSET_MS).getUTCHours()
export const inSendHours = (d) => { const h = gyeHour(d); return h >= SEND_HOURS[0] && h < SEND_HOURS[1] }

// ── Recipient list ────────────────────────────────────────────────────────────
const cap = (w) => w ? w.charAt(0).toLocaleUpperCase('es') + w.slice(1) : w
const capWords = (s) => s.split(/\s+/).filter(Boolean).map((w) => (w.toLowerCase() === 'y' ? 'y' : cap(w))).join(' ')
const noParens = (s) => String(s || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
const isCouple = (p) => /\sy\s/i.test(` ${noParens(p.nombre)} ${noParens(p.apellido)} `)

// Greeting: first word of nombre, capitalized ("carlos pallo" → "Carlos"); couples
// ("Belén y Orlando", stored as nombre "Belén" + apellido "y Orlando") get the full
// name; parentheses are dropped ("Camila Bravo (Domi)" → "Camila").
export function saludoFor(p) {
  const full = `${noParens(p.nombre)} ${noParens(p.apellido)}`.trim()
  if (isCouple(p)) return capWords(full)
  return cap(noParens(p.nombre).split(' ')[0] || '')
}

// Review-list label for the therapist: greeting + surname (couples: the full name).
export function etiquetaFor(p) {
  if (isCouple(p)) return saludoFor(p)
  return `${saludoFor(p)} ${capWords(String(p.apellido || '').trim())}`.trim()
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * patients: [{ id, nombre, apellido, telefono, sesiones }] (sesiones = session count).
 * Drops rows without a usable phone; dedupes by last-9 of the phone AND by full
 * name (a duplicate patient row with a mistyped phone), keeping the row with the
 * most sessions. Returns { recipients (sorted, numbered), dropped: [{ id, motivo }] }.
 */
export function buildRecipients(patients) {
  const dropped = []
  const withPhone = []
  for (const p of patients) {
    const d = String(p.telefono || '').replace(/[^\d+]/g, '')
    const e164 = d.startsWith('+') ? d : d.startsWith('593') ? `+${d}` : /^0?9\d{8}$/.test(d) ? `+593${d.replace(/^0/, '')}` : null
    if (!e164 || !/^\+\d{8,15}$/.test(e164)) { dropped.push({ id: p.id, motivo: 'sin teléfono válido' }); continue }
    withPhone.push({ ...p, e164 })
  }
  const best = (a, b) => ((b.sesiones || 0) > (a.sesiones || 0) ? b : a)
  const keep = (rows, keyFn, why) => {
    const m = new Map()
    for (const p of rows) {
      const k = keyFn(p)
      const prev = m.get(k)
      if (!prev) { m.set(k, p); continue }
      const win = best(prev, p)
      dropped.push({ id: (win === prev ? p : prev).id, motivo: `${why} (se queda ${win.id})` })
      m.set(k, win)
    }
    return [...m.values()]
  }
  let rows = keep(withPhone, (p) => last9(p.e164), 'mismo teléfono')
  rows = keep(rows, (p) => fold(`${p.nombre} ${p.apellido}`), 'mismo nombre')
  const recipients = rows
    .map((p) => ({ patient_id: p.id, telefono: p.e164, saludo: saludoFor(p), etiqueta: etiquetaFor(p) }))
    .sort((a, b) => fold(a.etiqueta).localeCompare(fold(b.etiqueta)))
    .map((r, i) => ({ ...r, orden: i + 1 }))
  return { recipients, dropped }
}

export const fillBody = (body, saludo) => String(body).replace('{{1}}', saludo)

// ── Default external effects ──────────────────────────────────────────────────
async function templateStatus(name) {
  const out = await listTemplates()
  return (out.templates || []).find((t) => t.name === name)?.status || null
}

export const defaultDeps = {
  sendStaffText, sendBroadcastTemplate, notifyOwner, templateStatus, now: () => new Date(),
}

// ── Sweep ─────────────────────────────────────────────────────────────────────
export async function runBroadcastSweep(supabase, { deps = defaultDeps } = {}) {
  const now = deps.now()
  const report = { inHours: inSendHours(now), broadcasts: [] }

  const { data: listos, error } = await supabase.from('broadcasts').select('*').eq('estado', 'listo').order('created_at')
  if (error) throw new Error('broadcasts read failed: ' + error.message)

  let budget = MAX_SENDS_PER_RUN
  for (const b of listos || []) {
    const br = { id: b.id, nombre: b.nombre, free: 0, template: 0, failed: 0, waiting: 0, closed: false }
    const { data: recs, error: rErr } = await supabase.from('broadcast_recipients').select('*').eq('broadcast_id', b.id).order('orden')
    if (rErr) throw new Error('recipients read failed: ' + rErr.message)

    // 1) Send (only inside 08:00–21:00 GYE).
    const pending = (recs || []).filter((r) => !r.excluido && !r.claimed_at)
    if (report.inHours && pending.length && budget > 0) {
      // Last inbound per phone in ONE query (only the last 24h matter).
      const since = new Date(now.getTime() - 24 * 3600e3).toISOString()
      const { data: inb } = await supabase.from('whatsapp_messages').select('received_at, raw_payload->message->>from')
        .eq('direccion', 'inbound').gte('received_at', since)
      const lastIn = new Map()
      for (const m of inb || []) {
        const k = last9(m.from)
        if (!lastIn.has(k) || m.received_at > lastIn.get(k)) lastIn.set(k, m.received_at)
      }
      let status // lazily, once per broadcast
      const approved = async () => {
        if (status === undefined) {
          try { status = b.template_name ? await deps.templateStatus(b.template_name) : null } catch (e) { console.warn('[broadcast] template status failed:', e.message); status = null }
        }
        return status === 'APPROVED'
      }

      for (const r of pending) {
        if (budget <= 0) break
        const open = windowOpen(lastIn.get(last9(r.telefono)) || null, now)
        const canal = open ? 'free' : (await approved()) ? 'template' : null
        if (!canal) { br.waiting++; continue }
        const { data: claimed } = await supabase.from('broadcast_recipients')
          .update({ claimed_at: now.toISOString(), canal })
          .eq('id', r.id).is('claimed_at', null).eq('excluido', false).select('id')
        if (!claimed?.length) continue
        budget--
        r.claimed_at = now.toISOString()
        try {
          const wamid = canal === 'free'
            ? await deps.sendStaffText(r.telefono, fillBody(b.body, r.saludo))
            : await deps.sendBroadcastTemplate(r.telefono, b.template_name, r.saludo)
          const sentAt = deps.now().toISOString()
          await supabase.from('broadcast_recipients').update({ wamid, sent_at: sentAt }).eq('id', r.id)
          Object.assign(r, { wamid, sent_at: sentAt })
          br[canal]++
        } catch (e) {
          const msg = String(e.message).slice(0, 500)
          await supabase.from('broadcast_recipients').update({ error: msg }).eq('id', r.id)
          r.error = msg
          br.failed++
          console.warn(`[broadcast] send failed ${b.id}/${r.id}:`, msg)
        }
      }
    } else if (pending.length) {
      br.waiting = pending.length
    }

    // 2) Reconcile async failures (131049 marketing cap, undeliverable…).
    const sent = (recs || []).filter((r) => r.wamid && !r.error)
    if (sent.length) {
      const { data: fails } = await supabase.from('whatsapp_delivery_status')
        .select('wamid, error_code, error_title, error_message').eq('status', 'failed').in('wamid', sent.map((r) => r.wamid))
      for (const f of fails || []) {
        const r = sent.find((x) => x.wamid === f.wamid)
        const msg = `${f.error_code || ''} ${f.error_title || f.error_message || 'failed'}`.trim()
        await supabase.from('broadcast_recipients').update({ error: msg }).eq('id', r.id)
        r.error = msg
      }
    }

    // 3) Close + notify once.
    const live = (recs || []).filter((r) => !r.excluido)
    const unclaimed = live.filter((r) => !r.claimed_at).length
    const lastSent = Math.max(0, ...live.map((r) => (r.sent_at ? new Date(r.sent_at).getTime() : 0)))
    const settled = now.getTime() - lastSent >= SETTLE_MS
    if ((recs || []).length && !unclaimed && settled && live.every((r) => r.sent_at || r.error)) {
      const { data: closed } = await supabase.from('broadcasts')
        .update({ estado: 'enviado', notified_at: now.toISOString() }).eq('id', b.id).eq('estado', 'listo').select('id')
      if (closed?.length) {
        br.closed = true
        const failed = live.filter((r) => r.error)
        const ok = live.length - failed.length
        const resumen = failed.length
          ? `Difusión "${b.nombre}": ${failed.length} no la recibieron`
          : `Difusión "${b.nombre}": enviada a ${ok}`
        const lines = failed.map((r) => `- ${r.etiqueta || r.saludo} (${r.telefono}): ${r.error}`)
        const body = failed.length
          ? `${resumen}. Llegó a ${ok}. Envíales el mensaje a mano desde la app:\n${lines.join('\n')}`
          : `${resumen}. No hubo fallos.`
        try { await deps.notifyOwner(supabase, { kind: 'broadcast_resultado', resumen, messages: [{ type: 'text', body }] }) }
        catch (e) { console.warn('[broadcast] notifyOwner failed:', e.message) }
      }
    }
    report.broadcasts.push(br)
  }
  return report
}
