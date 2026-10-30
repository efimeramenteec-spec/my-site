// netlify/lib/hqDesk.mjs
//
// Efimeramente HQ desk (#96 WhatsApp, #97 office game). Nicolás writes "Michael: ¿qué está pendiente?" to the
// 9933 and the named employee answers in their own voice. The webhook only RECOGNISES the
// order (parseHqOrder) and wakes hq-desk-background; everything else lives here.
//
// READ-ONLY BY DESIGN: this file writes ONLY hq_orders and owner_outbox. It never touches
// payments, sessions, invoices, patients or anything patient-facing. An order that needs
// real work is stored as 'en_cola' (Michael's morning brief lists them) and the reply says
// so; a Terminal session executes it. Money, patient messages and anything public always
// wait for Nicolás's "sí".
//
// Reply delivery: an owner_outbox row (kind 'hq_reply', texto_exacto) sent to Nicolás only,
// and only while his 24 h window is open. Window closed → the reply stays stored (row
// 'pendiente', flushed on his next message), NO ping_nico template is sent.

import AGENTS from './hqAgents.json' with { type: 'json' }
import { callClaudeHQ } from './leadBrain.mjs'
import { lastOwnerInbound, windowOpen, deliverRow } from './ownerOutbox.mjs'
import { ownerWhatsApp } from './whatsapp.mjs'
import { isOwnerPhone } from './facturarAprobacion.mjs'

export const HQ_AGENTS = ['michael', 'alex', 'vince', 'tim', 'wes']
export const OWNER_LAST9 = '968029896' // +593968029896, the only number the desk serves
export const MAX_REPLY = 600
// Sonnet pricing, USD per million tokens (input, output).
const PRICE = { in: 3, out: 15 }

const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')

// "Michael: texto" / "wes, texto" (any case, accents tolerated: "Míchael:", "WÉS,").
// Returns { agent, texto } or null. Only text messages; the name must be the first word.
const ORDER_RE = new RegExp(`^\\s*(${HQ_AGENTS.join('|')})\\s*[:,]\\s*([\\s\\S]*)$`, 'i')
export function parseHqOrder(msg) {
  if (msg?.type !== 'text') return null
  const body = String(msg.text?.body || '')
  const m = fold(body).match(ORDER_RE)
  if (!m) return null
  // The names contain no ':' or ',', so the first one in the ORIGINAL body is the separator
  // (keeps the order's accents and ¿ intact).
  const sep = body.search(/[:,]/)
  return { agent: m[1].toLowerCase(), texto: body.slice(sep + 1).trim() }
}

export const isHqOwner = (from) => last9(from) === OWNER_LAST9

const GYE_TODAY = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)

// Read-only snapshot of the operation. Each block fails soft (an error line, not a crash).
export async function buildSnapshot(supabase) {
  const out = {}
  const run = async (key, fn) => { try { out[key] = await fn() } catch (e) { out[key] = { error: e.message } } }
  const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  await Promise.all([
    run('comprobantes_retenidos', async () => {
      const { data, error } = await supabase.from('whatsapp_messages')
        .select('received_at, propuesta, patients(nombre, apellido)')
        .not('propuesta', 'is', null).is('reconciled_at', null).is('cierre', null)
        .order('received_at', { ascending: false }).limit(10)
      if (error) throw error
      return (data || []).map((r) => ({
        paciente: [r.patients?.nombre, r.patients?.apellido].filter(Boolean).join(' ') || 'sin identificar',
        recibido: r.received_at?.slice(0, 10),
        propuesta: r.propuesta?.resumen || r.propuesta?.motivo || r.propuesta?.tipo || 'ver panel',
      }))
    }),
    run('lotes_sin_aprobar', async () => {
      const { data, error } = await supabase.from('saldo_lotes')
        .select('amount, remaining, origin, created_at').is('aprobado_at', null).gt('remaining', 0).limit(20)
      if (error) throw error
      return { total: (data || []).length, monto: (data || []).reduce((s, r) => s + Number(r.remaining || 0), 0) }
    }),
    run('sesiones_hoy', async () => {
      const { count, error } = await supabase.from('sessions').select('id', { count: 'exact', head: true })
        .eq('fecha', GYE_TODAY()).neq('estado', 'cancelada').neq('tipo', 'llamada')
      if (error) throw error
      return count
    }),
    run('leads_24h', async () => {
      const { data, error } = await supabase.from('leads').select('stage, categoria, agendo_at')
        .gte('created_at', since24).eq('es_prueba', false)
      if (error) throw error
      return { total: (data || []).length, agendaron: (data || []).filter((l) => l.agendo_at).length }
    }),
    run('ordenes_hq_abiertas', async () => {
      const { data, error } = await supabase.from('hq_orders').select('created_at, agent, texto, estado')
        .in('estado', ['nuevo', 'en_cola']).order('created_at', { ascending: true }).limit(15)
      if (error) throw error
      return (data || []).map((o) => ({ ...o, texto: String(o.texto).slice(0, 120) }))
    }),
    run('nomina', async () => {
      const { data, error } = await supabase.from('payroll_runs').select('periodo, estado')
        .order('periodo', { ascending: false }).limit(20)
      if (error) throw error
      const ultimo = data?.[0]?.periodo || null
      const filas = (data || []).filter((r) => r.periodo === ultimo)
      return { ultimo_periodo: ultimo, estados: filas.reduce((a, r) => ({ ...a, [r.estado]: (a[r.estado] || 0) + 1 }), {}) }
    }),
  ])
  out.fecha_gye = GYE_TODAY()
  return out
}

const REPLY_TOOL = {
  name: 'responder',
  description: 'La respuesta a Nicolás y si la orden necesita trabajo de Terminal.',
  input_schema: {
    type: 'object',
    properties: {
      respuesta: { type: 'string', description: `Máximo ${MAX_REPLY} caracteres, en tu voz, en el idioma de la orden.` },
      necesita_trabajo: { type: 'boolean', description: 'true si la orden pide hacer/cambiar/enviar/construir algo (no solo informar).' },
    },
    required: ['respuesta', 'necesita_trabajo'],
  },
}

const CHANNEL_LINE = {
  whatsapp: 'You are answering Nicolás on WhatsApp',
  panel: 'You are answering Nicolás inside the HQ office game: he just walked up to your desk and talked to you',
}

export function buildSystem(agentKey, canal = 'whatsapp') {
  const a = AGENTS[agentKey]
  return `${a.body}

---
HQ DESK MODE (#96/#97). ${CHANNEL_LINE[canal] || CHANNEL_LINE.whatsapp}, as ${a.name[0].toUpperCase() + a.name.slice(1)}.
- Reply in the language of his order (Spanish by default), in your own voice, max ${MAX_REPLY}
  characters, plain text (no markdown, no tables).
- You can ONLY read: the snapshot below is everything you know about live data. Never claim you did,
  changed, sent, approved or posted anything. Never invent numbers that aren't in the snapshot.
- If the order needs real work (build, change, send, approve, post, pay, contact a patient), set
  necesita_trabajo=true and say it is noted for Terminal (e.g. "Anotado. Lo ejecuto con Terminal.").
  Money, patient messages and anything public always wait for Nicolás's "sí".
- If the order belongs to another employee, say who and keep it short.
- The recent conversation is context: continue it naturally, don't repeat yourself.
- Standing facts (company memory): Meta Ads are OFF since 27 Oct by Nicolás's decision, so 0 new
  ad leads is expected, not a problem. The first call is free (confirmed 29 Oct). Say only what
  the snapshot shows about a receipt; don't guess who forwarded it or why. For the full backlog,
  point to Michael's /michael session.`
}

export function costUsd(usage) {
  const i = Number(usage?.input_tokens || 0), o = Number(usage?.output_tokens || 0)
  return Math.round(((i * PRICE.in + o * PRICE.out) / 1e6) * 1e5) / 1e5
}

export const clip = (s, n = MAX_REPLY) => {
  const t = String(s || '').trim()
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…'
}

const defaultDeps = { callClaude: callClaudeHQ, deliverRow, lastOwnerInbound, owner: ownerWhatsApp, now: () => new Date() }

// Last few answered exchanges with this employee (both channels), oldest first.
async function recentHistory(supabase, agent, excludeId) {
  try {
    const { data } = await supabase.from('hq_orders').select('id, created_at, texto, respuesta')
      .eq('agent', agent).not('respuesta', 'is', null).order('created_at', { ascending: false }).limit(5)
    return (data || []).filter((r) => r.id !== excludeId).slice(0, 4).reverse()
      .map((r) => ({ cuando: String(r.created_at).slice(0, 16), nicolas: String(r.texto).slice(0, 300), tu: String(r.respuesta).slice(0, 400) }))
  } catch { return [] }
}

// The shared step of both channels: snapshot + history + Claude → the hq_orders patch.
// Never throws: a failed call becomes an en_cola order with a short "noted" reply.
export async function answerOrder(supabase, row, canal, deps = defaultDeps) {
  try {
    const [snapshot, historial] = await Promise.all([buildSnapshot(supabase), recentHistory(supabase, row.agent, row.id)])
    const user = `${historial.length ? `Conversación reciente contigo:\n${JSON.stringify(historial, null, 1)}\n\n` : ''}Orden de Nicolás para ti: "${row.texto || '(vacía)'}"\n\nSnapshot de solo lectura (${snapshot.fecha_gye}, hora Ecuador):\n${JSON.stringify(snapshot, null, 1)}`
    const out = await deps.callClaude({ system: buildSystem(row.agent, canal), user, tool: REPLY_TOOL })
    let respuesta = clip(out.input.respuesta)
    const estado = out.input.necesita_trabajo ? 'en_cola' : 'respondido'
    if (estado === 'en_cola' && !/terminal/i.test(respuesta)) respuesta = clip(`${respuesta} Anotado. Lo ejecuto con Terminal.`)
    const u = out.usage || {}
    return {
      respuesta, estado, model: out.model || null, error: null,
      input_tokens: u.input_tokens ?? null, output_tokens: u.output_tokens ?? null,
      cost_usd: u.input_tokens != null ? costUsd(u) : null,
      updated_at: deps.now().toISOString(),
    }
  } catch (e) {
    return {
      respuesta: 'Anotado. No pude revisar los datos ahora; lo vemos con Terminal.', estado: 'en_cola',
      error: String(e.message).slice(0, 500), updated_at: deps.now().toISOString(),
    }
  }
}

// WhatsApp channel (#96). Returns the hq_orders row id + what happened.
export async function handleHqOrder(supabase, { agent, texto, wamid, from, msgTs }, deps = defaultDeps) {
  if (!HQ_AGENTS.includes(agent)) throw new Error('unknown agent ' + agent)
  if (!isHqOwner(from)) throw new Error('not the owner phone')

  // 1. Store the order first (wamid unique: a retried webhook can't create a second row).
  const { data: row, error: insErr } = await supabase.from('hq_orders')
    .insert({ agent, texto: texto || '', wamid: wamid || null, estado: 'nuevo', canal: 'whatsapp' }).select().single()
  if (insErr) {
    if (/duplicate|unique/i.test(insErr.message)) return { duplicate: true }
    throw new Error('hq_orders insert failed: ' + insErr.message)
  }

  // 2. Snapshot + history + Claude.
  const ans = await answerOrder(supabase, row, 'whatsapp', deps)
  const { respuesta, estado } = ans

  // 3. Queue the reply for Nicolás only; send now only if his 24 h window is open.
  const name = agent[0].toUpperCase() + agent.slice(1)
  const body = `${name}: ${respuesta}`
  const { data: ob, error: obErr } = await supabase.from('owner_outbox')
    .insert({ kind: 'hq_reply', resumen: `${name} respondió`, payload: { messages: [{ type: 'texto_exacto', body }] }, estado: 'pendiente' })
    .select().single()
  const patch = { ...ans, outbox_id: ob?.id || null }
  if (obErr || !ob) {
    await supabase.from('hq_orders').update({ ...patch, error: 'outbox insert: ' + (obErr?.message || 'no row') }).eq('id', row.id)
    return { id: row.id, estado, sent: false }
  }

  const to = deps.owner()
  let lastIn = null
  try { lastIn = await deps.lastOwnerInbound(supabase, to) } catch {}
  const msgIso = msgTs ? new Date(Number(msgTs) * 1000).toISOString() : null
  const newest = [lastIn, msgIso].filter(Boolean).sort().pop() || null
  if (!isHqOwner(to) || !windowOpen(newest, deps.now())) {
    await supabase.from('hq_orders').update({ ...patch, error: 'ventana de 24 h cerrada: respuesta guardada, no enviada' }).eq('id', row.id)
    return { id: row.id, estado, sent: false, reason: 'window_closed' }
  }
  const r = await deps.deliverRow(supabase, to, ob)
  await supabase.from('hq_orders').update({
    ...patch, reply_wamid: r.wamids?.[0] || null, error: r.sent ? patch.error : String(r.error || 'no enviado').slice(0, 500),
  }).eq('id', row.id)
  return { id: row.id, estado, sent: !!r.sent, reply_wamid: r.wamids?.[0] || null }
}

// Office-game channel (#97): the row was created by hq-chat (owner-gated); answer it in place.
// Nothing is sent anywhere: the game polls hq-chat?id= for the reply.
export async function handlePanelOrder(supabase, orderId, deps = defaultDeps) {
  const { data: row, error } = await supabase.from('hq_orders').select('*').eq('id', orderId).single()
  if (error || !row) throw new Error('order not found')
  if (row.canal !== 'panel' || row.estado !== 'nuevo' || row.respuesta) return { id: row.id, skipped: true }
  const ans = await answerOrder(supabase, row, 'panel', deps)
  await supabase.from('hq_orders').update(ans).eq('id', row.id)
  return { id: row.id, estado: ans.estado }
}

// The webhook's single routing question: is this inbound an HQ order? Owner phone only
// (isOwnerPhone AND the hard-coded +593968029896), text only, employee prefix only.
export function hqOrderFor(msg) {
  if (!isOwnerPhone(msg?.from) || !isHqOwner(msg?.from)) return null
  return parseHqOrder(msg)
}
