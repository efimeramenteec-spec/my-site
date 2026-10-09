// netlify/lib/leadLinker.mjs
//
// #69 — close the attribution leak. A llamada (or a patient's first real session)
// can end up with NO lead linked when the phone typed at booking differs from the
// WhatsApp number (typos, swapped digits, a relative's phone), so the CAPI sweep
// never reports it to Meta. Two fixes share this file:
//
//   1. linkLeadById — the booking link now carries the lead (`/agendar?…&l=<lead id>`);
//      createBooking links THAT lead even if the typed phone differs.
//   2. runLeadLinker — a sweep (lead-followups cron + one-off backfill) that finds the
//      lead for every unlinked booking, first UNIQUE match wins:
//        (1) last-9 phone digits
//        (2) a lead active in the 72 h before the booking whose number differs by ≤2
//            digits (typo / swap) from the typed phone
//        (3) a lead active in the 72 h before the booking whose WhatsApp profile name
//            matches the patient's (first name + one more token, accent/case-insensitive)
//      Ambiguous / none → no link, logged.
//
// Rules (both paths): only NULL lead fields are filled, never overwritten; a lead
// already tied to a DIFFERENT patient is skipped + reported; es_prueba leads are
// never linked to a real booking (#56). Patient phones are NEVER changed — case (2)
// only reports the WhatsApp number so Nicolás can fix it by hand.

const H = 3600e3
const WINDOW_H = 72

// PostgREST caps a response at 1000 rows — page through.
async function all(build) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < 1000) return out
  }
}

const digits = (p) => String(p || '').replace(/\D/g, '')
const last9 = (p) => digits(p).slice(-9)
// National number: drop the 593 country code / trunk 0 so "+59363158790" and
// "+593963158790" compare as "63158790" vs "963158790" (one dropped digit).
export function nationalDigits(p) {
  let d = digits(p)
  if (d.startsWith('593')) d = d.slice(3)
  if (d.startsWith('0')) d = d.slice(1)
  return d
}

// Optimal-string-alignment distance (Levenshtein + adjacent transposition).
export function phoneDistance(a, b) {
  const s = nationalDigits(a), t = nationalDigits(b)
  if (!s || !t) return Infinity
  const d = Array.from({ length: s.length + 1 }, (_, i) => [i, ...Array(t.length).fill(0)])
  for (let j = 1; j <= t.length; j++) d[0][j] = j
  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[s.length][t.length]
}

export const nameTokens = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 2)

// WhatsApp profile name contains the patient's first name AND at least one more
// of the patient's name tokens (second name or a surname).
export function nameMatches(patient, waName) {
  const wa = new Set(nameTokens(waName))
  const nom = nameTokens(patient?.nombre)
  if (!nom.length || !wa.has(nom[0])) return false
  const rest = [...nom.slice(1), ...nameTokens(patient?.apellido)]
  return rest.some((t) => wa.has(t))
}

// Pure matcher. booking = { telefono, nombre, apellido, bookedAtMs };
// leads = [{ id, phone, wa_name, es_prueba, activeAtMs: [ms…] }].
// → { lead, rule } | { ambiguous: rule, candidates } | { none: true }
export function matchLead(booking, leads) {
  const pool = leads.filter((l) => !l.es_prueba)
  const active = (l) => (l.activeAtMs || []).some((t) => t <= booking.bookedAtMs + 60e3 && t >= booking.bookedAtMs - WINDOW_H * H)
  const l9 = last9(booking.telefono)
  const steps = [
    ['last9', (l) => l9.length === 9 && last9(l.phone) === l9],
    ['phone_typo', (l) => active(l) && last9(l.phone) !== l9 && phoneDistance(l.phone, booking.telefono) <= 2],
    ['wa_name', (l) => active(l) && nameMatches(booking, l.wa_name)],
  ]
  for (const [rule, pred] of steps) {
    const hits = pool.filter(pred)
    if (hits.length === 1) return { lead: hits[0], rule }
    if (hits.length > 1) return { ambiguous: rule, candidates: hits.map((h) => h.id) }
  }
  return { none: true }
}

// Only-null patch for one lead ← one session: patient_id, session_id, and agendo_at
// (llamadas only, = when it was booked). Returns { patch } | { conflict }.
// NEVER touches `stage`: lead-followups B/C/D message leads by stage, so a link made
// here must not change what any lead receives (#69 stop condition). The CAPI sweep
// keys on agendo_at/session_id/patient_id, which is all this needs.
export function linkPatch(lead, session) {
  if (lead.patient_id && lead.patient_id !== session.patient_id) return { conflict: 'lead_has_other_patient' }
  const patch = {}
  if (!lead.patient_id) patch.patient_id = session.patient_id
  if (!lead.session_id) patch.session_id = session.id
  if (session.tipo === 'llamada' && !lead.agendo_at) patch.agendo_at = session.created_at || new Date().toISOString()
  return { patch }
}

async function applyPatch(supabase, lead, patch) {
  if (!Object.keys(patch).length) return true
  // Guard every filled column with IS NULL so a concurrent writer can't be overwritten.
  let q = supabase.from('leads').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', lead.id).eq('es_prueba', lead.es_prueba)
  for (const k of ['patient_id', 'session_id', 'agendo_at']) if (k in patch) q = q.is(k, null)
  const { error } = await q
  if (error) { console.error(`[linker] update lead=${lead.id}:`, error.message); return false }
  return true
}

// Booking-link path (&l=<lead id>). allowPrueba: the booking itself is a #56 test
// booking — then ONLY an es_prueba lead links; a real booking never links one.
export async function linkLeadById(supabase, leadId, session, { allowPrueba = false } = {}) {
  if (!leadId || !/^[0-9a-f-]{36}$/i.test(String(leadId))) return { ok: false, reason: 'invalid_id' }
  const { data: lead } = await supabase.from('leads')
    .select('id, es_prueba, patient_id, session_id, agendo_at').eq('id', leadId).maybeSingle()
  if (!lead) return { ok: false, reason: 'not_found' }
  if (!!lead.es_prueba !== !!allowPrueba) return { ok: false, reason: 'prueba_mismatch' }
  const { patch, conflict } = linkPatch(lead, session)
  if (conflict) { console.warn(`[linker] &l= skip lead=${lead.id}: ${conflict}`); return { ok: false, reason: conflict } }
  const ok = await applyPatch(supabase, lead, patch)
  console.log(`[linker] &l= lead=${lead.id} session=${session.id} ${ok ? 'linked' : 'failed'} ${JSON.stringify(Object.keys(patch))}`)
  return { ok, patch }
}

// ── The sweep ─────────────────────────────────────────────────────────────────
// sinceIso: bookings created from this instant (cron: last 8 days — the CAPI 7-day
// limit; backfill: 2026-10-01). dryRun: compute + report, write nothing.
export async function runLeadLinker(supabase, { sinceIso, dryRun = false } = {}) {
  const since = sinceIso || new Date(Date.now() - 8 * 24 * H).toISOString()
  const report = []

  let sessions
  try {
    sessions = await all(() => supabase.from('sessions')
      .select('id, patient_id, tipo, estado, pagado, notas, fecha, created_at')
      .gte('created_at', since).not('patient_id', 'is', null).order('created_at', { ascending: true }))
  } catch (e) { console.error('[linker] query:', e.message); return { error: e.message, report } }

  const pIds = [...new Set((sessions || []).map((s) => s.patient_id))]
  if (!pIds.length) return { report }
  const [patients, leadsAll, earlier] = await Promise.all([
    all(() => supabase.from('patients').select('id, nombre, apellido, telefono').in('id', pIds)),
    all(() => supabase.from('leads').select('id, phone, wa_name, es_prueba, first_at, patient_id, session_id, agendo_at, paciente_at, stage, ctwa_clid').order('id')),
    // Real sessions created BEFORE the window, to know whether one in-window is the first.
    all(() => supabase.from('sessions').select('patient_id').in('patient_id', pIds).neq('tipo', 'llamada').neq('estado', 'cancelada').lt('created_at', since).order('id')),
  ])
  const patientById = new Map((patients || []).map((p) => [p.id, p]))
  const hadRealBefore = new Set((earlier || []).map((s) => s.patient_id))

  // Candidates: llamadas + each patient's first real (non-cancelled) session. Test bookings skipped.
  const seenReal = new Set(hadRealBefore)
  const todo = []
  for (const s of sessions || []) {
    if (String(s.notas || '').startsWith('[PRUEBA]')) continue
    if (s.tipo === 'llamada') { todo.push(s); continue }
    if (s.estado === 'cancelada' || seenReal.has(s.patient_id)) continue
    seenReal.add(s.patient_id)
    todo.push(s)
  }
  const linkedSession = new Set((leadsAll || []).map((l) => l.session_id).filter(Boolean))
  const linkedPatient = new Set((leadsAll || []).map((l) => l.patient_id).filter(Boolean))
  const unlinked = todo.filter((s) => !linkedSession.has(s.id) && !linkedPatient.has(s.patient_id))
  if (!unlinked.length) return { report }

  // Activity = first contact + every inbound message, only inside the windows we need.
  const minMs = Math.min(...unlinked.map((s) => new Date(s.created_at).getTime())) - WINDOW_H * H
  const msgs = await all(() => supabase.from('whatsapp_messages')
    .select('received_at, from_digits:raw_payload->message->>from').eq('direccion', 'inbound')
    .gte('received_at', new Date(minMs).toISOString()).order('received_at'))
  const actByL9 = new Map()
  for (const m of msgs || []) {
    const k = last9(m.from_digits); if (!k) continue
    if (!actByL9.has(k)) actByL9.set(k, [])
    actByL9.get(k).push(new Date(m.received_at).getTime())
  }
  const pool = (leadsAll || []).map((l) => ({
    ...l, activeAtMs: [new Date(l.first_at).getTime(), ...(actByL9.get(last9(l.phone)) || [])],
  }))

  for (const s of unlinked) {
    const p = patientById.get(s.patient_id) || {}
    const row = { session_id: s.id, tipo: s.tipo, created_at: s.created_at, patient: `${p.nombre || ''} ${p.apellido || ''}`.trim(), typed_phone: p.telefono }
    const m = matchLead({ telefono: p.telefono, nombre: p.nombre, apellido: p.apellido, bookedAtMs: new Date(s.created_at).getTime() }, pool)
    if (m.none) { report.push({ ...row, result: 'no_match' }); continue }
    if (m.ambiguous) { report.push({ ...row, result: 'ambiguous', rule: m.ambiguous, candidates: m.candidates }); continue }
    const lead = m.lead
    const { patch, conflict } = linkPatch(lead, s)
    if (conflict) { report.push({ ...row, result: 'skipped', reason: conflict, lead_id: lead.id }); continue }
    const entry = { ...row, result: dryRun ? 'would_link' : 'linked', rule: m.rule, lead_id: lead.id, lead_phone: lead.phone, wa_name: lead.wa_name, has_clid: !!lead.ctwa_clid, fields: Object.keys(patch) }
    if (m.rule === 'phone_typo') entry.phone_to_fix = { patient_id: s.patient_id, typed: p.telefono, whatsapp: lead.phone }
    if (!dryRun) {
      const ok = await applyPatch(supabase, lead, patch)
      if (!ok) entry.result = 'error'
      else { Object.assign(lead, patch) } // later sessions of the same lead see the filled fields
    }
    report.push(entry)
  }
  const tally = report.reduce((a, r) => ({ ...a, [r.result]: (a[r.result] || 0) + 1 }), {})
  console.log(`[linker] ${JSON.stringify(tally)}${report.filter((r) => r.result !== 'linked').map((r) => `\n  ${r.result} ${r.session_id} ${r.patient}${r.rule ? ` (${r.rule})` : ''}`).join('')}`)
  return { report, tally }
}
