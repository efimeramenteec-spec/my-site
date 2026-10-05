// netlify/lib/facturarAprobacion.mjs
//
// /facturar by WhatsApp approval (#16, decided 28 Sep: invoices only on Nicolás's
// approval, and only the exact list he saw). Flow:
//   1. Mon+Thu 09:00 GYE facturar-report (#45): dry-run → 'pendiente' snapshot
//      (origen 'cron') → the list + [Aprobar] [Ahora no] via notifyOwner (owner
//      outbox: sent now if his 24h window is open, else ping_nico and his tap
//      flushes it). He never has to remember to ask.
//   2. Or Nicolás writes "facturas" to the 9933 → handleFacturasCommand: the same
//      snapshot (origen 'comando') + list + buttons, sent straight back.
//   3. Aprobar (fac_ok:<id>) → the webhook fires facturar-aprobar-background, which
//      runs runAprobacion: atomic pendiente→aprobada claim (double-tap guard), then
//      emitOne for each snapshot id STILL eligible (sessions outside the snapshot
//      are never added), then the RIDE WhatsApp for exactly those, then a reply.
//      Ahora no (fac_no:<id>) → 'descartada'.
// Everything is owner-phone only (ownerWhatsApp(), OWNER_WHATSAPP env or the
// +593968029896 default) and consumed by the webhook BEFORE the lead bot.
//
// Every external effect goes through `deps` so the harness can stub Contífico,
// WhatsApp and push; production always uses the defaults below.

import { normalizePhone, ownerWhatsApp } from './whatsapp.mjs'
import { sendText, sendButtons } from './waSend.mjs'
import { notifyTherapist } from './push.mjs'
import { dryRun, emitOne, ridePlan, sendRides, money } from './facturarCore.mjs'
import { notifyOwner, supersedeOwnerOutbox } from './ownerOutbox.mjs'

const TABLE = 'factura_aprobaciones'
const VIGENCIA_MS = 48 * 3600 * 1000
const ITEMS_PER_MESSAGE = 10
const RIDE_ATTEMPTS = 4          // SRI authorization is async (usually seconds)
const RIDE_RETRY_MS = 15000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const defaultDeps = {
  dryRun, emitOne, ridePlan, sendRides, sendText, sendButtons, notifyTherapist,
  notifyOwner, supersedeOwnerOutbox, now: () => new Date(), sleep,
}

const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)
const plain = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
// 'YYYY-MM-DD' → '25 sep'
function fechaCorta(fechaStr) {
  const [, m, d] = String(fechaStr || '').split('-').map(Number)
  return m && d ? `${d} ${MES_CORTO[m - 1]}` : String(fechaStr || '')
}
// 39 → '$39' · 39.5 → '$39.50'
export function fmtMoney(n) {
  const v = money(n || 0)
  return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`
}
const pagador = (item) => String(item.billing_to || '').replace(/ \(payer\)$/, '')

// Core blocking reasons are English (dry-run JSON) — Nicolás reads Spanish.
function motivoEs(item) {
  return (item.blocking || []).map((r) => {
    if (r === 'patient has no cédula/contifico_id') return 'falta la cédula del paciente'
    const m = r.match(/^payer "(.*)" has no cédula\/contifico_id$/)
    if (m) return `falta la cédula de ${m[1]}`
    return r
  }).join('; ')
}

// ── Recognizers (used by the webhook) ───────────────────────────────────────
export function isOwnerPhone(fromRaw) {
  const owner = ownerWhatsApp()
  if (!owner || !fromRaw) return false
  return normalizePhone(fromRaw) === owner || last9(fromRaw) === last9(owner)
}
export function isFacturasCommand(msg) {
  return msg?.type === 'text' && plain(msg.text?.body) === 'facturas'
}
// fac_ok:<uuid> / fac_no:<uuid> from a reply-button tap, else null.
export function facturaTap(msg) {
  const id = msg?.type === 'interactive' ? msg.interactive?.button_reply?.id
    : msg?.type === 'button' ? msg.button?.payload : null
  const m = String(id || '').match(/^fac_(ok|no):([0-9a-f-]{36})$/i)
  return m ? { action: m[1].toLowerCase(), snapshotId: m[2] } : null
}

const EXPIRED = 'Esa lista ya no está vigente. Escribe facturas para una nueva.'

// ── Snapshot + the exact list/buttons messages ──────────────────────────────
// Shared by the "facturas" command (sends them directly — his message opened the
// window) and the Mon+Thu cron (hands them to notifyOwner). Expires any older
// 'pendiente' snapshot: only the newest list is ever approvable.
// messages: [{ type:'text', body } | { type:'buttons', body, buttons }]
export async function prepareFacturas(supabase, origen, deps = defaultDeps) {
  const { ready, blocked } = await deps.dryRun(supabase)

  await supabase.from(TABLE).update({ estado: 'vencida' }).eq('estado', 'pendiente')

  const blockedLines = blocked.length
    ? [`Bloqueadas (${blocked.length}):`, ...blocked.map((b) => `- ${b.patient} — ${motivoEs(b)}`)]
    : []

  if (!ready.length) {
    const body = ['No hay sesiones listas para facturar.', ...(blockedLines.length ? ['', ...blockedLines] : [])].join('\n')
    return { snapshot: null, ready: 0, blocked: blocked.length, messages: [{ type: 'text', body }] }
  }

  const total = money(ready.reduce((s, i) => s + Number(i.monto || 0), 0))
  const lista = ready.map((i) => ({
    session_id: i.session_id, paciente: i.patient, pagador: pagador(i), monto: i.monto, fecha: i.fecha,
  }))
  const { data: snap, error } = await supabase.from(TABLE)
    .insert({ origen, session_ids: ready.map((i) => i.session_id), total, estado: 'pendiente',
      resultado: { lista } })
    .select().single()
  if (error || !snap) throw new Error('snapshot insert failed: ' + (error?.message || 'no row'))

  const itemLines = lista.map((l, n) =>
    `${n + 1}. ${l.paciente} · factura a ${l.pagador} · ${fmtMoney(l.monto)} · ${fechaCorta(l.fecha)}`)
  const chunks = []
  for (let k = 0; k < itemLines.length; k += ITEMS_PER_MESSAGE) chunks.push(itemLines.slice(k, k + ITEMS_PER_MESSAGE))
  chunks[0] = [`Listas para facturar (${ready.length}, total ${fmtMoney(total)}):`, ...chunks[0]]

  const closing = 'Toca Aprobar para emitirlas y enviar cada factura por WhatsApp.'
  const lastBody = [...chunks[chunks.length - 1], ...(blockedLines.length ? ['', ...blockedLines] : []), '', closing].join('\n')
  const buttons = [{ id: `fac_ok:${snap.id}`, title: 'Aprobar' }, { id: `fac_no:${snap.id}`, title: 'Ahora no' }]

  const messages = chunks.slice(0, -1).map((c) => ({ type: 'text', body: c.join('\n') }))
  if (lastBody.length <= 1024) {
    messages.push({ type: 'buttons', body: lastBody, buttons })
  } else {
    // Interactive bodies cap at 1024 chars — never truncate the list silently.
    messages.push({ type: 'text', body: [...chunks[chunks.length - 1], ...(blockedLines.length ? ['', ...blockedLines] : [])].join('\n') })
    messages.push({ type: 'buttons', body: closing, buttons })
  }
  return { snapshot: snap.id, ready: ready.length, blocked: blocked.length, messages }
}

// ── "facturas" → fresh snapshot + list + buttons ────────────────────────────
export async function handleFacturasCommand(supabase, to, deps = defaultDeps) {
  const r = await prepareFacturas(supabase, 'comando', deps)
  for (const m of r.messages) {
    // eslint-disable-next-line no-await-in-loop
    if (m.type === 'buttons') await deps.sendButtons(to, m.body, m.buttons)
    // eslint-disable-next-line no-await-in-loop
    else await deps.sendText(to, m.body)
  }
  return { snapshot: r.snapshot, ready: r.ready, blocked: r.blocked }
}

// ── Ahora no ────────────────────────────────────────────────────────────────
export async function handleDescartar(supabase, to, snapshotId, deps = defaultDeps) {
  const { data } = await supabase.from(TABLE).update({ estado: 'descartada' })
    .eq('id', snapshotId).eq('estado', 'pendiente').select()
  await deps.sendText(to, data?.length ? 'Ok, no se factura nada.' : EXPIRED)
  return { descartada: !!data?.length }
}

// ── Aprobar → emit exactly the snapshot (runs in the background function) ───
export async function runAprobacion(supabase, to, snapshotId, deps = defaultDeps) {
  const cutoff = new Date(deps.now().getTime() - VIGENCIA_MS).toISOString()

  // Claim FIRST: one atomic pendiente→aprobada flip. A double tap / Meta retry
  // finds no 'pendiente' row and stops here, so nothing is ever emitted twice.
  const { data: claimed, error: claimErr } = await supabase.from(TABLE)
    .update({ estado: 'aprobada', aprobada_at: deps.now().toISOString() })
    .eq('id', snapshotId).eq('estado', 'pendiente').gte('created_at', cutoff)
    .select()
  if (claimErr) throw new Error('claim failed: ' + claimErr.message)
  const snap = claimed?.[0]
  if (!snap) {
    const { data: cur } = await supabase.from(TABLE).select('id, estado, created_at').eq('id', snapshotId).maybeSingle()
    if (cur?.estado === 'aprobada') {
      console.log(`[facturar-wa] ${snapshotId} already aprobada — duplicate tap ignored`)
      return { status: 'duplicate' }
    }
    if (cur?.estado === 'pendiente') await supabase.from(TABLE).update({ estado: 'vencida' }).eq('id', snapshotId).eq('estado', 'pendiente')
    await deps.sendText(to, EXPIRED)
    return { status: 'expired' }
  }

  const lista = snap.resultado?.lista || []
  const nombre = (id) => lista.find((l) => l.session_id === id)?.paciente || id.slice(0, 8)

  // Re-check every snapshot id against the CURRENT eligible set (same core rule,
  // floor honored). Sessions that became eligible after the snapshot are in
  // `items` but are never iterated — only snap.session_ids are.
  const { items } = await deps.dryRun(supabase)
  const byId = new Map(items.map((i) => [i.session_id, i]))
  const emitidas = []
  const omitidas = []
  for (const id of snap.session_ids) {
    const item = byId.get(id)
    if (!item || !item.ready) {
      omitidas.push({ session_id: id, paciente: nombre(id), motivo: item ? motivoEs(item) : 'ya no está pendiente de facturar' })
      continue
    }
    // eslint-disable-next-line no-await-in-loop
    const r = await deps.emitOne(supabase, item)
    emitidas.push({ ...r, paciente: item.patient, documento: item.payload?.documento || null })
  }

  // RIDE WhatsApp for exactly the sessions emitted+marked here. Unauthorized ones
  // are retried a few times; anything still pending is picked up by the next run.
  let pendientes = emitidas.filter((r) => r.emitted && r.marked_facturada).map((r) => r.session_id)
  const rides = []
  for (let a = 0; a < RIDE_ATTEMPTS && pendientes.length; a++) {
    // eslint-disable-next-line no-await-in-loop
    await deps.sleep(a === 0 ? 5000 : RIDE_RETRY_MS)
    const plan = []
    for (const id of pendientes) {
      // eslint-disable-next-line no-await-in-loop
      plan.push(...(await deps.ridePlan(supabase, id)))
    }
    // eslint-disable-next-line no-await-in-loop
    const sent = await deps.sendRides(supabase, plan)
    rides.push(...sent)
    const done = new Set(sent.map((s) => s.session_id))
    // Keep retrying only what is NOT yet sendable (e.g. not yet SRI-authorized).
    pendientes = plan.filter((p) => !p.ready && !done.has(p.session_id)).map((p) => p.session_id)
  }
  const ridesPendientes = pendientes

  const criticos = emitidas.filter((r) => r.emitted && !r.marked_facturada)
  const k = emitidas.filter((r) => r.emitted).length
  const s = rides.filter((r) => r.sent).length
  const resultado = { lista, emitidas, omitidas, rides, rides_pendientes: ridesPendientes }
  await supabase.from(TABLE).update({ resultado }).eq('id', snap.id)

  const lines = [`Listo. Emitidas ${k} de ${snap.session_ids.length}. Enviadas por WhatsApp ${s}.`]
  for (const o of omitidas) lines.push(`- ${o.paciente}: no se emitió, ${o.motivo}`)
  for (const e of emitidas.filter((r) => !r.emitted)) lines.push(`- ${e.paciente}: no se emitió (${e.step || e.error || 'error'})`)
  for (const r of rides.filter((x) => !x.sent)) lines.push(`- ${nombre(r.session_id)}: factura no enviada por WhatsApp`)
  for (const id of ridesPendientes) lines.push(`- ${nombre(id)}: factura aún sin autorizar, se envía en la próxima corrida`)
  for (const c of criticos) lines.push(`CRÍTICO: ${c.documento || c.contifico_id} emitida sin marcar, revisar antes de volver a facturar`)
  await deps.sendText(to, lines.join('\n'))

  if (criticos.length) {
    await deps.notifyTherapist(supabase, null, {
      title: 'CRÍTICO facturación',
      body: criticos.map((c) => `${c.documento || c.contifico_id} emitida sin marcar, revisar antes de volver a facturar`).join(' · '),
      url: '/',
    })
  }
  return { status: 'done', emitted: k, sent: s, omitidas: omitidas.length, criticos: criticos.length }
}

// ── Mon+Thu cron (facturar-report) → owner outbox (#45) ─────────────────────
// Nothing ready or blocked → nothing. Otherwise the same snapshot + list + buttons
// the "facturas" command builds, delivered by notifyOwner (now if his window is
// open, else ping_nico → his tap flushes it). Nothing is emitted here: emission
// only ever follows his [Aprobar] tap (fac_ok → runAprobacion).
export async function runReport(supabase, deps = defaultDeps) {
  const { ready, blocked } = await deps.dryRun(supabase)
  if (!ready.length && !blocked.length) return { notified: false, ready: 0, blocked: 0 }
  const once = { ...deps, dryRun: async () => ({ ready, blocked }) }
  const r = await prepareFacturas(supabase, 'cron', once)
  const resumen = ready.length
    ? `${ready.length} facturas listas para aprobar`
    : `${blocked.length} facturas bloqueadas por datos faltantes`
  await deps.supersedeOwnerOutbox(supabase, 'facturas')
  const n = await deps.notifyOwner(supabase, { kind: 'facturas', resumen, messages: r.messages })
  return { notified: true, ready: ready.length, blocked: blocked.length, snapshot: r.snapshot, via: n?.via, resumen }
}
