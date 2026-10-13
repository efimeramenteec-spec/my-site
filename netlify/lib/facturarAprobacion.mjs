// netlify/lib/facturarAprobacion.mjs
//
// /facturar on WhatsApp. Since #72 (Nicolás, 13 Oct) invoicing runs AUTOMATICALLY —
// no approval step; he's notified afterwards and mistakes get annulled:
//   1. Mon+Thu 09:00 GYE facturar-report → runReport → runAuto('auto'): emits every
//      eligible session (same core rules), logs factura_aprobaciones (origen 'auto',
//      estado 'aprobada'), then ONE notifyOwner (kind 'facturas_emitidas', no buttons).
//   2. "facturas" to the 9933 = the same run on demand (origen 'comando'), executed in
//      facturar-aprobar-background (long Contífico loop off the webhook), reply direct.
//   RIDEs are NOT sent here: the 15-min sweep (rideSweep.mjs, #47) sends each one
//   once the SRI authorizes it.
//   Legacy: [Aprobar]/[Ahora no] (fac_ok/fac_no) are no longer sent; a tap on an old
//   list still resolves through runAprobacion / handleDescartar.
// Everything is owner-phone only (ownerWhatsApp(), OWNER_WHATSAPP env or the
// +593968029896 default) and consumed by the webhook BEFORE the lead bot.
//
// Every external effect goes through `deps` so the harness can stub Contífico,
// WhatsApp and push; production always uses the defaults below.

import { normalizePhone, ownerWhatsApp } from './whatsapp.mjs'
import { sendText, sendButtons } from './waSend.mjs'
import { notifyTherapist } from './push.mjs'
import { dryRun, emitOne, money } from './facturarCore.mjs'
import { notifyOwner, supersedeOwnerOutbox } from './ownerOutbox.mjs'

const TABLE = 'factura_aprobaciones'
const VIGENCIA_MS = 48 * 3600 * 1000
const ITEMS_PER_MESSAGE = 10

const defaultDeps = {
  dryRun, emitOne, sendText, sendButtons, notifyTherapist,
  notifyOwner, supersedeOwnerOutbox, now: () => new Date(),
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

// ── Auto run: emit everything eligible, then ONE informational message (#72) ─
// Nicolás, 13 Oct: invoicing runs automatically — no approval step; he's told
// afterwards and mistakes get annulled. Same eligibility as always (dryRun: pagado,
// not facturada, non-llamada, confirmada, floor, en espera excluded, concepto
// general respected), one invoice per session, fecha_emision = today (core rule).
// Each run is logged in factura_aprobaciones (origen 'auto' from the cron,
// 'comando' from "facturas", estado 'aprobada'). A failed emission never blocks
// the others — failures are listed. `preview: true` = the dry run: nothing is
// emitted, logged or sent; returns the message it WOULD send (+ the items).
// Returns { emitted, failed, blocked, enEspera, total, resumen, messages, snapshot }.
const EN_CURSO_MS = 15 * 60 * 1000

function lineaItem(i, documento) {
  return `${i.patient} · factura a ${pagador(i)} · ${fmtMoney(i.monto)} · ${fechaCorta(i.fecha)}${documento ? ` · ${documento}` : ''}`
}

export async function runAuto(supabase, origen, deps = defaultDeps, { preview = false } = {}) {
  const { ready, blocked, enEspera = [] } = await deps.dryRun(supabase)
  const empty = { emitted: 0, failed: 0, blocked: blocked.length, enEspera: enEspera.length, total: 0, messages: [] }
  if (!ready.length && !blocked.length && !enEspera.length) return { ...empty, resumen: null }

  let snap = null
  if (!preview && ready.length) {
    // Overlap guard: a run (cron or "facturas") still in progress → don't start a second.
    const since = new Date(deps.now().getTime() - EN_CURSO_MS).toISOString()
    const { data: running } = await supabase.from(TABLE).select('id')
      .in('origen', ['auto', 'comando']).eq('estado', 'aprobada').gte('created_at', since)
      .eq('resultado->>en_curso', 'true').limit(1)
    if (running?.length) return { ...empty, resumen: null, skipped: 'run en curso ' + running[0].id }
    const { data, error } = await supabase.from(TABLE).insert({
      origen, estado: 'aprobada', aprobada_at: deps.now().toISOString(),
      session_ids: ready.map((i) => i.session_id), total: money(ready.reduce((s, i) => s + Number(i.monto || 0), 0)),
      resultado: { en_curso: true },
    }).select().single()
    if (error || !data) throw new Error('log insert failed: ' + (error?.message || 'no row'))
    snap = data
  }

  const emitidas = []
  const fallidas = []
  for (const item of ready) {
    if (preview) { emitidas.push({ item, documento: null }); continue }
    try {
      // Last-moment re-check: another path may have invoiced it since the dry run.
      // eslint-disable-next-line no-await-in-loop
      const { data: cur } = await supabase.from('sessions').select('facturada, pagado, estado').eq('id', item.session_id).maybeSingle()
      if (!cur || cur.facturada || !cur.pagado || cur.estado !== 'confirmada') {
        fallidas.push({ item, motivo: 'ya no está pendiente de facturar' })
        continue
      }
      // eslint-disable-next-line no-await-in-loop
      const r = await deps.emitOne(supabase, item)
      if (r.emitted) emitidas.push({ item, r, documento: item.payload?.documento || r.contifico_id })
      else fallidas.push({ item, r, motivo: r.step || r.error || 'error' })
    } catch (e) {
      fallidas.push({ item, motivo: String(e.message || e) })
    }
  }
  const criticos = emitidas.filter((e) => e.r && !e.r.marked_facturada)
  const total = money(emitidas.reduce((s, e) => s + Number(e.item.monto || 0), 0))

  const lines = emitidas.length
    ? [`${emitidas.length} ${emitidas.length === 1 ? 'factura emitida' : 'facturas emitidas'} (${fmtMoney(total)}):`,
      ...emitidas.map((e, n) => `${n + 1}. ${lineaItem(e.item, e.documento)}`)]
    : ['No se emitieron facturas.']
  if (fallidas.length) lines.push('', `No se emitieron (${fallidas.length}):`, ...fallidas.map((f) => `- ${lineaItem(f.item)} — ${f.motivo}`))
  if (blocked.length) lines.push('', `Bloqueadas (${blocked.length}):`, ...blocked.map((b) => `- ${b.patient} — ${motivoEs(b)}`))
  for (const e of enEspera) lines.push(`En espera: ${e.nombre} (${e.sesiones} ${e.sesiones === 1 ? 'sesión' : 'sesiones'})`)
  for (const c of criticos) lines.push(`CRÍTICO: ${c.documento} emitida sin marcar, revisar antes de volver a facturar`)
  if (emitidas.length && !preview) lines.push('', 'Cada factura se envía sola por WhatsApp apenas el SRI la autorice.')

  // WhatsApp text bodies cap at 4096 — split on line boundaries, never truncate.
  const messages = []
  let cur = ''
  for (const l of lines) {
    if (cur && (cur + '\n' + l).length > 3800) { messages.push({ type: 'text', body: cur }); cur = l } else cur = cur ? cur + '\n' + l : l
  }
  if (cur) messages.push({ type: 'text', body: cur })

  const resumen = emitidas.length
    ? `${emitidas.length} ${emitidas.length === 1 ? 'factura emitida' : 'facturas emitidas'} (${fmtMoney(total)})${fallidas.length ? `, ${fallidas.length} con error` : ''}`
    : fallidas.length ? `${fallidas.length} facturas no se pudieron emitir`
      : blocked.length ? `${blocked.length} facturas bloqueadas por datos faltantes`
        : `${enEspera.length} ${enEspera.length === 1 ? 'paciente' : 'pacientes'} con facturación en espera`

  if (snap) {
    const resultado = {
      emitidas: emitidas.map((e) => ({ session_id: e.item.session_id, paciente: e.item.patient, monto: e.item.monto,
        documento: e.documento, contifico_id: e.r?.contifico_id, marked_facturada: e.r?.marked_facturada })),
      fallidas: fallidas.map((f) => ({ session_id: f.item.session_id, paciente: f.item.patient, motivo: f.motivo })),
      rides_pendientes: emitidas.filter((e) => e.r?.marked_facturada).map((e) => e.item.session_id),
    }
    await supabase.from(TABLE).update({ resultado, total }).eq('id', snap.id)
  }
  if (criticos.length) {
    await deps.notifyTherapist(supabase, null, {
      title: 'CRÍTICO facturación',
      body: criticos.map((c) => `${c.documento} emitida sin marcar, revisar antes de volver a facturar`).join(' · '),
      url: '/',
    })
  }
  return { emitted: emitidas.length, failed: fallidas.length, blocked: blocked.length, enEspera: enEspera.length,
    total, resumen, messages, snapshot: snap?.id || null,
    items: preview ? ready.map((i) => ({ session_id: i.session_id, fecha: i.fecha, patient: i.patient,
      billing_to: i.billing_to, monto: i.monto, descripcion: i.descripcion })) : undefined }
}

// ── "facturas" → manual run of the same auto path, reply straight back ─────
export async function handleFacturasCommand(supabase, to, deps = defaultDeps) {
  const r = await runAuto(supabase, 'comando', deps)
  const messages = r.messages.length ? r.messages
    : [{ type: 'text', body: r.skipped ? 'Ya hay una facturación en curso, espera unos minutos.' : 'No hay sesiones listas para facturar.' }]
  for (const m of messages) {
    // eslint-disable-next-line no-await-in-loop
    await deps.sendText(to, m.body)
  }
  return { snapshot: r.snapshot, emitted: r.emitted, failed: r.failed, blocked: r.blocked }
}

// ── Legacy [Aprobar]/[Ahora no] taps (pre-#72 lists) ────────────────────────
// No list with buttons is sent anymore; these only answer a tap on an old one
// (any still-'pendiente' snapshot is re-checked and emitted as before).
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

  // No RIDE here (#47): the 15-min sweep sends each one as soon as the SRI
  // authorizes it. rides_pendientes = every emitted+marked id, for the audit.
  const ridesPendientes = emitidas.filter((r) => r.emitted && r.marked_facturada).map((r) => r.session_id)

  const criticos = emitidas.filter((r) => r.emitted && !r.marked_facturada)
  const k = emitidas.filter((r) => r.emitted).length
  const resultado = { lista, emitidas, omitidas, rides_pendientes: ridesPendientes }
  await supabase.from(TABLE).update({ resultado }).eq('id', snap.id)

  const lines = [`Listo. Emitidas ${k} de ${snap.session_ids.length}.`]
  for (const e of emitidas.filter((r) => r.emitted)) {
    lines.push(`${e.paciente}: factura ${e.documento || e.contifico_id} emitida, se envía sola apenas el SRI la autorice.`)
  }
  for (const o of omitidas) lines.push(`- ${o.paciente}: no se emitió, ${o.motivo}`)
  for (const e of emitidas.filter((r) => !r.emitted)) lines.push(`- ${e.paciente}: no se emitió (${e.step || e.error || 'error'})`)
  for (const c of criticos) lines.push(`CRÍTICO: ${c.documento || c.contifico_id} emitida sin marcar, revisar antes de volver a facturar`)
  await deps.sendText(to, lines.join('\n'))

  if (criticos.length) {
    await deps.notifyTherapist(supabase, null, {
      title: 'CRÍTICO facturación',
      body: criticos.map((c) => `${c.documento || c.contifico_id} emitida sin marcar, revisar antes de volver a facturar`).join(' · '),
      url: '/',
    })
  }
  return { status: 'done', emitted: k, omitidas: omitidas.length, criticos: criticos.length }
}

// ── Mon+Thu cron (facturar-report) → emit + ONE notifyOwner (#72) ──────────
// Emits everything eligible by itself (runAuto, origen 'auto'), then tells
// Nicolás once (kind 'facturas_emitidas', informational, no buttons) via the
// owner outbox. Nothing ready, blocked or en espera → nothing sent.
export async function runReport(supabase, deps = defaultDeps) {
  const r = await runAuto(supabase, 'auto', deps)
  if (!r.messages.length) return { notified: false, ...r }
  await deps.supersedeOwnerOutbox(supabase, 'facturas')
  const n = await deps.notifyOwner(supabase, { kind: 'facturas_emitidas', resumen: r.resumen, messages: r.messages })
  return { notified: true, via: n?.via, ...r, messages: undefined }
}
