// netlify/lib/ownerOutbox.mjs
//
// Owner outbox (#45). ANY workflow that must reach Nicolás calls notifyOwner —
// never a new template, never a "remember to write X" push. Rule (decided 5 Oct):
// Nicolás must never have to remember to trigger a recurring flow.
//
//   notifyOwner({ kind, resumen, messages })
//     - queues a row in owner_outbox ('pendiente');
//     - his 24h window open (inbound from the owner phone in whatsapp_messages in
//       the last 24h, minus a 5-min margin) → sends it now → 'enviado';
//     - closed → stays 'pendiente' and, if no ping went out since his last inbound,
//       sends ping_nico ({{1}} = resumen of what's pending). One ping per closed window.
//     - ping_nico not APPROVED (as UTILITY) or the send fails → Web Push fallback
//       with the same resumen; the row stays 'pendiente'.
//   flushOwnerOutbox() — the webhook calls it on ANY owner inbound (his "Ver" tap,
//     a text, a command): sends every 'pendiente' row oldest-first.
//
// messages: [{ type:'text', body }, { type:'buttons', body, buttons:[{ id, title }] }]
// — free-form session messages (waSend.mjs), valid only once his window is open.
//
// Every external effect goes through `deps` so the harness can stub WhatsApp,
// Meta template status and push; production always uses the defaults below.

import { ownerWhatsApp } from './whatsapp.mjs'
import { sendText, sendButtons } from './waSend.mjs'
import { notifyTherapist } from './push.mjs'
import { listTemplates, sendOwnerPing, PING_TEMPLATE, OWNER_TEMPLATES } from './leadTemplates.mjs'

const TABLE = 'owner_outbox'
const WINDOW_MS = 24 * 3600 * 1000
const SAFETY_MS = 5 * 60 * 1000
const RESUMEN_MAX = 100

const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)

async function pingTemplateApproved() {
  const out = await listTemplates()
  const t = (out.templates || []).find((x) => x.name === PING_TEMPLATE)
  const want = OWNER_TEMPLATES.find((x) => x.name === PING_TEMPLATE).category
  // A reclassified (MARKETING) template waits for Nicolás's decision → push instead.
  return !!t && t.status === 'APPROVED' && t.category === want
}

const defaultDeps = {
  sendText, sendButtons, notifyTherapist, sendOwnerPing, pingTemplateApproved,
  owner: ownerWhatsApp, now: () => new Date(),
}

// Newest inbound from the owner phone (ISO string) or null.
async function lastOwnerInbound(supabase, owner) {
  const { data, error } = await supabase.from('whatsapp_messages')
    .select('received_at').eq('direccion', 'inbound')
    .like('raw_payload->message->>from', `%${last9(owner)}`)
    .order('received_at', { ascending: false }).limit(1)
  if (error) throw new Error('owner inbound lookup failed: ' + error.message)
  return data?.[0]?.received_at || null
}

export function windowOpen(lastInboundIso, now) {
  if (!lastInboundIso) return false
  return now.getTime() - new Date(lastInboundIso).getTime() < WINDOW_MS - SAFETY_MS
}

// One line, ≤100 chars: newest resumen, or "{n} pendientes: r1, r2…" (oldest first).
export function buildResumen(pendientes) {
  const rs = pendientes.map((r) => r.resumen).filter(Boolean)
  const line = (s) => String(s).replace(/\s+/g, ' ').trim()
  let out = rs.length > 1 ? `${rs.length} pendientes: ${rs.map(line).join(', ')}` : line(rs[rs.length - 1] || 'tienes mensajes pendientes')
  if (out.length > RESUMEN_MAX) out = out.slice(0, RESUMEN_MAX - 1).trimEnd() + '…'
  return out
}

async function sendMessages(to, messages, deps) {
  for (const m of messages || []) {
    // eslint-disable-next-line no-await-in-loop
    if (m.type === 'buttons') await deps.sendButtons(to, m.body, m.buttons)
    // eslint-disable-next-line no-await-in-loop
    else await deps.sendText(to, m.body)
  }
}

// Atomic claim (pendiente→enviado) so two concurrent webhooks never double-send;
// a failed send reverts the row to 'pendiente' with the error.
async function deliverRow(supabase, to, row, deps) {
  const { data: claimed } = await supabase.from(TABLE)
    .update({ estado: 'enviado', sent_at: deps.now().toISOString(), error: null })
    .eq('id', row.id).eq('estado', 'pendiente').select()
  if (!claimed?.length) return { id: row.id, sent: false, skipped: true }
  try {
    await sendMessages(to, row.payload?.messages, deps)
    return { id: row.id, sent: true }
  } catch (e) {
    await supabase.from(TABLE).update({ estado: 'pendiente', sent_at: null, error: String(e.message).slice(0, 500) }).eq('id', row.id)
    return { id: row.id, sent: false, error: e.message }
  }
}

async function pushFallback(supabase, resumen, deps) {
  await deps.notifyTherapist(supabase, null, {
    title: 'Efimeramente', body: `${resumen}. Escribe cualquier cosa al 9933 para verlo.`, url: '/',
  })
}

export async function notifyOwner(supabase, { kind, resumen, messages }, deps = defaultDeps) {
  const to = deps.owner()
  if (!to) throw new Error('owner phone un-normalizable — nothing queued')
  const { data: row, error } = await supabase.from(TABLE)
    .insert({ kind, resumen, payload: { messages }, estado: 'pendiente' }).select().single()
  if (error || !row) throw new Error('owner_outbox insert failed: ' + (error?.message || 'no row'))

  const lastIn = await lastOwnerInbound(supabase, to)
  if (windowOpen(lastIn, deps.now())) {
    const r = await deliverRow(supabase, to, row, deps)
    if (r.sent) return { id: row.id, via: 'directo' }
    // Window looked open but the send failed — fall through to the closed path.
  }

  // Closed window: at most ONE ping since his last inbound.
  let q = supabase.from(TABLE).select('id').not('ping_sent_at', 'is', null)
  if (lastIn) q = q.gt('ping_sent_at', lastIn)
  const { data: pinged } = await q.limit(1)
  if (pinged?.length) return { id: row.id, via: 'en_cola' }

  const { data: pend } = await supabase.from(TABLE).select('id, resumen, created_at')
    .eq('estado', 'pendiente').order('created_at', { ascending: true })
  const texto = buildResumen(pend?.length ? pend : [row])

  let approved = false
  try { approved = await deps.pingTemplateApproved() } catch (e) { console.warn('[owner-outbox] template status failed:', e.message) }
  if (approved) {
    try {
      await deps.sendOwnerPing(to, texto)
      await supabase.from(TABLE).update({ ping_sent_at: deps.now().toISOString() }).eq('id', row.id)
      return { id: row.id, via: 'ping', resumen: texto }
    } catch (e) {
      console.warn('[owner-outbox] ping_nico send failed:', e.message)
      await supabase.from(TABLE).update({ error: `ping: ${String(e.message).slice(0, 400)}` }).eq('id', row.id)
    }
  }
  await pushFallback(supabase, texto, deps)
  return { id: row.id, via: 'push', resumen: texto }
}

// Owner wrote (any message) → his window is open: send every pending row in order.
// Stops at the first failure so the order is preserved for the next flush.
export async function flushOwnerOutbox(supabase, deps = defaultDeps) {
  const to = deps.owner()
  const { data: pend, error } = await supabase.from(TABLE).select('*')
    .eq('estado', 'pendiente').order('created_at', { ascending: true })
  if (error) throw new Error('owner_outbox read failed: ' + error.message)
  const out = []
  for (const row of pend || []) {
    // eslint-disable-next-line no-await-in-loop
    const r = await deliverRow(supabase, to, row, deps)
    out.push(r)
    if (!r.sent && !r.skipped) break
  }
  return out
}

// Retire pending rows of a kind that a fresher message replaces (e.g. Nicolás
// typed "facturas" — a new list supersedes the queued one).
export async function supersedeOwnerOutbox(supabase, kind) {
  await supabase.from(TABLE).update({ estado: 'fallido', error: 'reemplazado por uno más nuevo' })
    .eq('kind', kind).eq('estado', 'pendiente')
}
