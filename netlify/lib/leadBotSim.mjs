// netlify/lib/leadBotSim.mjs
//
// #54 — dry-run simulator for the lead bot. Runs real leadBot/leadBrain code
// against an IN-MEMORY Supabase (seeded read-only from the real therapists /
// funnel_categorias) with the WhatsApp + push transport swapped for a recorder.
// Nothing is sent and nothing is written to the real DB. Used by
// scripts/harness-lead-bot.mjs (local; no ANTHROPIC_API_KEY → keyword fallback)
// and by the token-gated lead-bot-dryrun function (real Claude classifier).

import { runBot, _setTransport, _setHourGYE } from './leadBot.mjs'
import { enqueueInbound, processInbox, QUIET_MS } from './leadTurns.mjs'

// ── A tiny in-memory PostgREST look-alike (only what the bot uses) ────────────
function getPath(row, col) {
  // "raw_payload->message->>from" style JSON paths, else a plain column.
  const parts = col.split(/->>?/)
  let v = row[parts[0]]
  for (const p of parts.slice(1)) v = v == null ? undefined : v[p]
  return v
}
class Query {
  constructor(db, table) { Object.assign(this, { db, table, filters: [], op: 'select', _order: null, _limit: null, _single: null, _returning: false }) }
  select() { if (this.op !== 'select') this._returning = true; return this }
  eq(c, v) { this.filters.push((r) => getPath(r, c) === v); return this }
  in(c, vs) { this.filters.push((r) => vs.includes(getPath(r, c))); return this }
  is(c, v) { this.filters.push((r) => (getPath(r, c) ?? null) === v); return this }
  not(c, op, v) { this.filters.push((r) => (getPath(r, c) ?? null) !== v); return this }
  lt(c, v) { this.filters.push((r) => getPath(r, c) < v); return this }
  gt(c, v) { this.filters.push((r) => getPath(r, c) > v); return this }
  neq(c, v) { this.filters.push((r) => getPath(r, c) !== v); return this }
  // "a.is.null,b.is.null" only (the CAPI sweep's shape).
  or(expr) { const cols = expr.split(',').map((x) => x.split('.')[0]); this.filters.push((r) => cols.some((c) => (getPath(r, c) ?? null) === null)); return this }
  delete() { this.op = 'delete'; return this }
  order(c, { ascending = true } = {}) { this._order = { c, ascending }; return this }
  limit(n) { this._limit = n; return this }
  maybeSingle() { this._single = 'maybe'; return this }
  single() { this._single = 'one'; return this }
  update(patch) { this.op = 'update'; this.patch = patch; return this }
  insert(row) { this.op = 'insert'; this.rows = Array.isArray(row) ? row : [row]; return this }
  upsert(row, { onConflict } = {}) {
    const rows = Array.isArray(row) ? row : [row]
    const all = this.rowsOf()
    const fresh = []
    for (const r of rows) {
      const hit = onConflict && all.find((x) => x[onConflict] === r[onConflict])
      if (hit) Object.assign(hit, structuredClone(r)); else fresh.push(r)
    }
    return this.insert(fresh)
  }
  rowsOf() { return (this.db[this.table] ||= []) }
  run() {
    const all = this.rowsOf()
    if (this.op === 'insert') {
      const made = this.rows.map((r) => ({ id: r.id || `${this.table}-${all.length + 1}`, created_at: new Date().toISOString(), ...r }))
      all.push(...made)
      return this.finish(made)
    }
    let rows = all.filter((r) => this.filters.every((f) => f(r)))
    if (this.op === 'delete') {
      this.db[this.table] = all.filter((r) => !rows.includes(r))
      return this.finish(null)
    }
    if (this.op === 'update') {
      for (const r of rows) Object.assign(r, structuredClone(this.patch))
      return this.finish(this._returning ? rows : null)
    }
    if (this._order) {
      const { c, ascending } = this._order
      rows = [...rows].sort((a, b) => (getPath(a, c) > getPath(b, c) ? 1 : -1) * (ascending ? 1 : -1))
    }
    if (this._limit != null) rows = rows.slice(0, this._limit)
    return this.finish(rows)
  }
  finish(rows) {
    const clone = rows == null ? null : structuredClone(rows)
    if (this._single) return { data: clone?.[0] ?? null, error: this._single === 'one' && !clone?.length ? { message: 'no rows' } : null }
    return { data: clone, error: null }
  }
  then(res, rej) { try { res(this.run()) } catch (e) { rej(e) } }
}
export function memSupabase(seed) {
  const db = structuredClone(seed)
  return { db, from: (t) => new Query(db, t) }
}

// Seed tables the bot reads, from the real DB (read-only queries).
export async function seedFrom(realSupabase) {
  const [th, cats, kn] = await Promise.all([
    realSupabase.from('therapists').select('id, nombre, apellido, genero, recibe_nuevos, activo, funnel_caption, funnel_card_url, booking_availability, calendar_email, telefono'),
    realSupabase.from('funnel_categorias').select('*'),
    realSupabase.from('funnel_knowledge').select('*'),
  ])
  return { therapists: th.data || [], funnel_categorias: cats.data || [], funnel_knowledge: kn.data || [], leads: [], whatsapp_messages: [], lead_ai_decisions: [], push_subscriptions: [] }
}

const NEW_LEAD = {
  stage: 'nuevo', step_actual: null, bot_paused: false, invitacion_enviada: false, saludo_enviado: false,
  nudges_sent: 0, categoria: null, quien: null, therapist_id: null, last_bot_at: null, last_bot_text: null,
  precio_visto_at: null, eligio_terapeuta_at: null, toco_at: null, stuck_push_at: null, cards_ofrecidas: null,
  turn_lock_at: null, canned_enviados: [],
  source: 'meta_ctwa', wa_name: 'Prueba Harness',
}

// Run scenarios. Each: { name, lead?: {…overrides}, steps: [ {text} | {tap:{id,title}} | {parallel:[{text},…]} ] }.
// Returns [{ name, turns: [{ in, out: [lines] }], lead }].
export async function simulate(seed, scenarios) {
  const sb = memSupabase(seed)
  process.env.LEAD_BOT_LIVE = 'true' // sends go to the recorder below, never to WhatsApp
  const outbox = new Map() // phone → array
  const rec = (phone, line) => { if (!outbox.has(phone)) outbox.set(phone, []); outbox.get(phone).push(line) }
  _setTransport({
    sendText: async (to, body) => rec(to, `TEXT  ${body}`),
    sendImage: async (to, { imageLink, caption }) => rec(to, `IMAGE ${imageLink ? '[foto] ' : ''}${caption.replace(/\n/g, ' ⏎ ')}`),
    sendLinkText: async (to, body) => rec(to, `LINK  ${body.replace(/\n/g, ' ⏎ ')}`),
    notifyTherapist: async (_s, _t, { title, body }) => rec('__push', `${title} — ${body}`),
  })
  const results = []
  let n = 0
  for (const sc of scenarios) {
    n++
    const phone = `+59390000${String(1000 + n).slice(-4)}`
    sb.db.leads.push({ id: `lead-${n}`, phone, ...NEW_LEAD, ...(sc.lead || {}) })
    _setHourGYE(sc.hourGYE ?? null) // pin the GYE hour for the day/night handoff copy
    const turns = []
    let k = 0
    // #59: free text / media go through the real merge + lock path (lead_inbox →
    // processInbox); a sequential step needs no quiet wait, a parallel group
    // waits the real 4 s. Taps stay inline.
    const one = async (step, quietMs = 0) => {
      const msg = step.tap
        ? { id: `m${n}-${++k}`, from: phone.slice(1), type: 'interactive', interactive: { type: 'button_reply', button_reply: step.tap } }
        : { id: `m${n}-${++k}`, from: phone.slice(1), type: step.type || 'text', ...(step.text != null ? { text: { body: step.text } } : {}) }
      sb.db.whatsapp_messages.push({ id: msg.id, direccion: 'inbound', twilio_sid: msg.id, cuerpo: step.text || step.tap?.title || `[${msg.type}]`, received_at: new Date().toISOString(), raw_payload: { message: msg } })
      const { data: lead } = await sb.from('leads').select('*').eq('phone', phone).maybeSingle()
      if (step.tap) return runBot(sb, { lead, isNew: k === 1, msg })
      await enqueueInbound(sb, { lead, msg, isNew: k === 1 })
      await processInbox(sb, lead.id, { quietMs })
    }
    for (const step of sc.steps) {
      const before = (outbox.get(phone) || []).length
      const pushBefore = (outbox.get('__push') || []).length
      if (step.parallel) {
        // Seconds apart: both turns start from the DB state before either finishes.
        const runs = []
        for (const s of step.parallel) { runs.push(one(s, QUIET_MS)); await new Promise((r) => setTimeout(r, step.gapMs ?? 50)) }
        await Promise.all(runs)
      } else {
        const { data: cur } = await sb.from('leads').select('bot_paused').eq('phone', phone).maybeSingle()
        if (cur?.bot_paused) { turns.push({ in: step.text ?? `[${step.type || 'tap'}]`, out: ['(bot pausado: lo atiende Nicolás)'] }); continue }
        await one(step)
      }
      const out = (outbox.get(phone) || []).slice(before)
      const pushes = (outbox.get('__push') || []).slice(pushBefore).map((p) => `PUSH  ${p}`)
      const label = step.parallel ? step.parallel.map((s) => s.text).join('  ‖  ') : (step.text ?? (step.tap ? `[tap ${step.tap.id}]` : `[${step.type}]`))
      turns.push({ in: label, out: [...out, ...pushes] })
    }
    const { data: lead } = await sb.from('leads').select('*').eq('phone', phone).maybeSingle()
    const decs = sb.db.lead_ai_decisions.filter((d) => d.lead_id === lead.id).map((d) => `${d.accion}:${d.motivo}${d.used_fallback ? ' (kw)' : d.model ? ` (${d.model})` : ''}`)
    _setHourGYE(null)
    results.push({ name: sc.name, turns, decisions: decs, lead: { step_actual: lead.step_actual, stage: lead.stage, bot_paused: lead.bot_paused, therapist_id: lead.therapist_id, eligio_terapeuta_at: !!lead.eligio_terapeuta_at, categoria: lead.categoria } })
  }
  return results
}

export function formatResults(results) {
  const lines = []
  for (const r of results) {
    lines.push(`\n━━ ${r.name}`)
    for (const t of r.turns) {
      lines.push(`  > ${t.in}`)
      if (!t.out.length) lines.push('    (SILENCIO)')
      for (const o of t.out) lines.push(`    ${o}`)
    }
    lines.push(`  · log: ${r.decisions.join(' | ') || '(none)'}`)
    lines.push(`  · lead: ${JSON.stringify(r.lead)}`)
  }
  return lines.join('\n')
}

// The #54 verification set (the VERIFY list of the plan).
const FRANCISCO = '2f5bf11b-42a8-562f-99c9-501c62a4ca04'
export const SCENARIOS = [
  { name: '1. precio con $', steps: [{ text: 'Cuál es el precio de las sesiones? $' }] },
  { name: '2. precio + ubicación', steps: [{ text: 'Cuál es el precio? Donde están ubicados' }] },
  { name: '3. invitación → si → hijo 15 → Francisco', steps: [
    { text: 'Cuál es el precio de las sesiones? $' }, { text: 'si' }, { text: 'para mi hijo, tiene 15' },
    { text: 'me gustaría con francisco por favor' },
  ] },
  { name: '4. pareja', steps: [{ text: 'Busco terapia de pareja' }] },
  { name: '5. duración', steps: [{ text: 'cuánto dura la sesión' }] },
  { name: '6. "jaja ok" en cada paso', steps: [
    { text: 'jaja ok' }, { text: 'Cuál es el precio?' }, { text: 'jaja ok' }, { text: 'si' }, { text: 'jaja ok' },
    { text: 'para mí' }, { text: 'jaja ok' },
  ] },
  { name: '7. flujo completo para mí', steps: [
    { text: 'Quiero saber el precio' }, { text: 'si' }, { text: 'para mí' }, { text: 'ansiedad' }, { text: 'Francisco' },
  ] },
  { name: '8. dos mensajes 3 s aparte', steps: [{ parallel: [{ text: 'Cuál es el precio?' }, { text: 'Donde están ubicados?' }], gapMs: 3000 }] },
  { name: '9. pregunta fuera de alcance', steps: [{ text: 'hacen visitas a domicilio?' }] },
  { name: '10. plantillas escritas', lead: { therapist_id: FRANCISCO, step_actual: 'agendado', stage: 'agendo', recordatorio_llamada_at: '2026-10-06T10:00:00Z', rebook_sent_at: '2026-10-06T10:00:00Z' }, steps: [
    { text: 'Confirmo' }, { text: 'Cambiar hora' }, { text: 'Sí reagendar' },
  ] },
  { name: '11. sticker en edad + "24"', lead: { step_actual: 'edad', quien: 'hijo', categoria: 'hijo', stage: 'toco', saludo_enviado: true }, steps: [
    { type: 'sticker' }, { text: '24' },
  ] },
  { name: '12. botón viejo [Sí] (chat previo)', lead: { step_actual: 'answered', invitacion_enviada: true, stage: 'nuevo' }, steps: [{ tap: { id: 'inv_si', title: 'Sí' } }] },
  // #55 — the bot speaks only as Nico.
  { name: '13. precio → si (un solo saludo)', steps: [{ text: 'Cuál es el precio de las sesiones? $' }, { text: 'si' }] },
  { name: '14. hola → hola (no se presenta dos veces)', steps: [{ text: 'Hola' }, { text: 'hola' }] },
  { name: '15. eres un bot? 15:00', hourGYE: 15, steps: [{ text: 'eres un bot?' }] },
  { name: '16. eres un bot? 23:30', hourGYE: 23, steps: [{ text: 'eres un bot?' }] },
  { name: '17. persona? 15:00', hourGYE: 15, steps: [{ text: 'estoy hablando con una persona?' }] },
  { name: '18. persona? 23:30', hourGYE: 23, steps: [{ text: 'estoy hablando con una persona?' }] },
  { name: '19. domicilio 15:00', hourGYE: 15, steps: [{ text: 'hacen visitas a domicilio?' }] },
  { name: '20. domicilio 23:30', hourGYE: 23, steps: [{ text: 'hacen visitas a domicilio?' }] },
  { name: '21. urgente', steps: [{ text: 'quiero hacerme daño' }] },
  // #59 — one coherent reply per turn + family therapy.
  { name: '22. adolescente 16 + familiar, 2 s aparte', steps: [{ parallel: [{ text: 'Hola ustedes atienden terapia para 16 años manejo de ira ?' }, { text: 'O terapias familiares ?' }], gapMs: 2000 }] },
  { name: '23. adolescentes solo → si', steps: [{ text: 'atienden adolescentes?' }, { text: 'si' }] },
  { name: '24. cuánto cuesta dos veces (turnos separados)', steps: [{ text: 'cuánto cuesta?' }, { text: 'cuánto cuesta?' }] },
  { name: '25. precio dos veces en el mismo turno', steps: [{ parallel: [{ text: 'cuánto cuesta?' }, { text: 'cuál es el precio de la sesión?' }], gapMs: 1500 }] },
  { name: '26. 3 mensajes en 5 s', steps: [{ parallel: [{ text: 'Hola' }, { text: 'cuánto cuesta?' }, { text: 'dónde están ubicados?' }], gapMs: 2500 }] },
]
