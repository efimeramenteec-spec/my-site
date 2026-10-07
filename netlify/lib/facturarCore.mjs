// netlify/lib/facturarCore.mjs
//
// The Contífico invoicing core, shared by:
//   • netlify/functions/facturar.mjs           — the token-guarded HTTP modes (/facturar)
//   • netlify/functions/facturar-report.mjs    — Mon+Thu 09:00 push to the owner
//   • netlify/lib/facturarAprobacion.mjs       — the WhatsApp "facturas" → Aprobar path
// Extracted verbatim from facturar.mjs (#16) so every path builds, checks and emits
// with the SAME code. See facturar.mjs for the safety model. Nothing in here emits
// on its own: emitOne / sendRides are only ever called behind an explicit guard
// (HTTP confirm phrase, or the owner's Aprobar tap on a snapshot he saw).

import { normalizePhone } from './whatsapp.mjs'
import { sendFactura } from './facturaWhatsapp.mjs'

const BASE = 'https://api.contifico.com/sistema/api/v1'
export const API_KEY = process.env.CONTIFICO_API_KEY || ''
export const POS_TOKEN = process.env.CONTIFICO_POS_TOKEN || ''
const SUPABASE_PROJECT = 'vnityzpuhnkumsyfnskz'

// Product to invoice. Filled in from `mode=recon` (?resource=productos) before
// the first dry-run so the payload is exact. IVA 0% (psychology is exempt).
// producto_id is Contífico's internal product id for "SESION INDIVIDUAL".
export const SESION_PRODUCT = {
  id: 'O8bYEmDllFv68b7j', // Contífico producto id for SESION INDIVIDUAL (recon 2026-09-24)
  nombre: 'SESION INDIVIDUAL',
}

// Establecimiento-punto de emisión for the electronic sequential. All 291 existing
// invoices are on 001-001; this account's API requires the `documento` number to
// be supplied (it is NOT auto-assigned — POST returns cod_error 1002 without it).
// The next sequential is computed live from Contífico right before each emission.
const PUNTO_EMISION = '001-001'

// Go-live floor: the protocol is NON-retroactive (Nicolás, 2026-09-23). Every
// session BEFORE this date was already invoiced in real life, so the API path
// must never touch them. Eligibility is hard-floored at this date on session
// `fecha`. Do not lower it — it is the wall that stops the historical backlog
// from being re-emitted.
export const FACTURAR_SINCE = '2026-09-24'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']


// 'YYYY-MM-DD' → "4 de Septiembre" (capitalized month, no year — matches the
// insurance format observed on real invoices). Parsed by parts to avoid TZ drift.
export function fechaTexto(fechaStr) {
  const [, m, d] = String(fechaStr || '').split('-').map(Number)
  if (!m || !d) return String(fechaStr || '')
  return `${d} de ${MESES[m - 1] || ''}`.trim()
}

// 'YYYY-MM-DD' → 'DD/MM/YYYY' (Contífico fecha_emision format).
// Today in Ecuador as 'YYYY-MM-DD'. The SRI only accepts electronic invoices whose
// fecha_emision is the CURRENT day (cod_error 1017 otherwise), so every factura is
// emitted with today's date; the session date stays in the Observaciones
// ("… | Sesión 25 de Septiembre"). Rule set by Nicolás 2026-10-02.
function todayEcuador() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date())
}

function fechaDMY(fechaStr) {
  const [y, m, d] = String(fechaStr || '').split('-')
  if (!y || !m || !d) return String(fechaStr || '')
  return `${d}/${m}/${y}`
}

export const money = (n) => Number(Number(n).toFixed(2))

// ── Contífico HTTP ──────────────────────────────────────────────────────────
function cfHeaders() {
  return { 'Content-Type': 'application/json', Authorization: API_KEY }
}

export async function cfGet(path) {
  const res = await fetch(BASE + path, { method: 'GET', headers: cfHeaders() })
  const text = await res.text()
  let body = null
  try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, ok: res.ok, body }
}

async function cfPost(path, payload) {
  const res = await fetch(BASE + path, {
    method: 'POST', headers: cfHeaders(), body: JSON.stringify(payload),
  })
  const text = await res.text()
  let body = null
  try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, ok: res.ok, body }
}

async function cfPut(path, payload) {
  const res = await fetch(BASE + path, {
    method: 'PUT', headers: cfHeaders(), body: JSON.stringify(payload || {}),
  })
  const text = await res.text()
  let body = null
  try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, ok: res.ok, body }
}

// ── Eligibility + billing resolution ────────────────────────────────────────
// Eligible: estado='confirmada' AND pagado AND NOT facturada AND tipo<>'llamada'
// AND patient.facturacion_obligatoria=true. NO date window, NO facturacion_manual
// exemption (deleted 2026-09-24 — the API can now produce the insurance format).
export async function fetchEligible(supabase, { ignoreFloor = false } = {}) {
  let query = supabase
    .from('sessions')
    .select(`
      id, fecha, monto, tipo, estado, pagado, facturada,
      patient:patients!inner (
        id, nombre, apellido, tipo_paciente, nombre_2, apellido_2,
        cedula, contifico_id, diagnostico_codigo, diagnostico_texto,
        facturacion_obligatoria, nombre_factura, facturar_desde,
        facturacion_en_espera, factura_concepto_general,
        payer:payers ( id, nombre, apellido, cedula, contifico_id,
                       razon_social, email, telefono )
      )
    `)
    .eq('estado', 'confirmada')
    .eq('pagado', true)
    .neq('tipo', 'llamada')
    .or('facturada.is.null,facturada.eq.false')
    .eq('patient.facturacion_obligatoria', true)
    // #60 hold: en-espera patients are never emitted — listed apart (fetchEnEspera).
    .eq('patient.facturacion_en_espera', false)
    .order('fecha', { ascending: true })
  const { data, error } = await query
  if (error) throw new Error('supabase eligible query failed: ' + error.message)
  // patient.facturacion_obligatoria filter above scopes the embed; keep only rows
  // whose patient survived the inner join and the flag.
  // NON-retroactive floor: never invoice the pre-go-live backlog. Per patient:
  // floor = coalesce(patient.facturar_desde, FACTURAR_SINCE) — facturar_desde is set
  // only for an explicit back-invoice (#44 María Emilia Worm). `ignoreFloor`
  // (dry-run ?all=1) lifts it for inspection ONLY — dry-run makes no Contífico calls.
  return (data || []).filter((s) => s.patient && s.patient.facturacion_obligatoria === true
    && (ignoreFloor || s.fecha >= (s.patient.facturar_desde || FACTURAR_SINCE)))
}

// #60 "En espera": obligatoria patients on hold (facturacion_en_espera) with their
// count of paid, uninvoiced, real sessions — shown on the facturas list as
// "En espera: {name} ({n} sesiones)", NEVER emitted. The count ignores the floor:
// the hold usually covers sessions from before it (e.g. Mauro Baquero, waiting on
// his insurer's diagnosis); lifting it for pre-floor sessions also needs
// patients.facturar_desde. Returns [{ patient_id, nombre, sesiones }].
export async function fetchEnEspera(supabase) {
  const { data: pats, error } = await supabase.from('patients')
    .select('id, nombre, apellido, tipo_paciente, nombre_2, apellido_2, nombre_factura')
    .eq('facturacion_obligatoria', true).eq('facturacion_en_espera', true)
  if (error) throw new Error('supabase en-espera query failed: ' + error.message)
  if (!pats?.length) return []
  const { data: ses, error: e2 } = await supabase.from('sessions')
    .select('patient_id')
    .in('patient_id', pats.map((p) => p.id))
    .eq('estado', 'confirmada').eq('pagado', true).neq('tipo', 'llamada')
    .or('facturada.is.null,facturada.eq.false')
  if (e2) throw new Error('supabase en-espera sessions query failed: ' + e2.message)
  return pats.map((p) => ({
    patient_id: p.id, nombre: patientDisplayName(p),
    sesiones: (ses || []).filter((x) => x.patient_id === p.id).length,
  }))
}

// The patient's own display name (always names the PATIENT in the descripcion,
// even when billing goes to a payer). For a menor the patient is the child.
export function patientDisplayName(p) {
  // Owner-set override (patients.nombre_factura) wins. Used when two patients
  // share a payer and must stay distinguishable — e.g. mother and daughter both
  // billed to Dorian Solis: "Cecilia Saltos" vs "Valentina Loor" (Nicolás 2026-10-02).
  if (p.nombre_factura && p.nombre_factura.trim()) return p.nombre_factura.trim()
  if (p.tipo_paciente === 'menor' && p.nombre_2) {
    // person 1 = tutor, person 2 = the minor (the actual patient).
    return `${p.nombre_2} ${p.apellido_2 || ''}`.trim()
  }
  return `${p.nombre} ${p.apellido || ''}`.trim()
}

// Billing identity = payer when payer_id is set, else the patient.
// `key` = the persona identifier sent to Contífico: prefer contifico_id (the
// clean 10-digit cédula-marker the personas are keyed by) over the raw cedula
// (which can carry a trailing "001"). Matches how real invoices are keyed.
function billingIdentity(p) {
  const payer = p.payer
  if (payer && payer.id) {
    const cedula = payer.cedula && payer.cedula !== 'na' ? payer.cedula : null
    return {
      source: 'payer',
      nombre: [payer.nombre, payer.apellido].filter(Boolean).join(' ').trim(),
      razon_social: payer.razon_social || null,
      cedula,
      contifico_id: payer.contifico_id || null,
      key: payer.contifico_id || cedula || null,
      email: payer.email || null,
      telefono: payer.telefono || null,
    }
  }
  const cedula = p.cedula && p.cedula !== 'na' ? p.cedula : null
  return {
    source: 'patient',
    nombre: [p.nombre, p.apellido].filter(Boolean).join(' ').trim(),
    razon_social: null,
    cedula,
    contifico_id: p.contifico_id || null,
    key: p.contifico_id || cedula || null,
    email: null,
    telefono: null,
  }
}

// The Observaciones string (goes in `descripcion`, mirrored to `referencia`):
//   Paciente {NOMBRE PACIENTE} | {CIE} {diagnóstico} | Sesión {fecha en texto}
// #60 concepto general (patients.factura_concepto_general): an adult paying through
// their own insurance for another person → no patient name, no diagnosis:
//   Sesión Psicológica Individual | Sesión {fecha en texto}
function buildDescripcion(p, session) {
  if (p.factura_concepto_general) return `Sesión Psicológica Individual | Sesión ${fechaTexto(session.fecha)}`
  const paciente = patientDisplayName(p)
  const cie = [p.diagnostico_codigo, p.diagnostico_texto].filter(Boolean).join(' ').trim()
  const sesion = `Sesión ${fechaTexto(session.fecha)}`
  // The CIE segment is included only when a diagnosis is on file. Patients without
  // one (e.g. Valentina Andrade, per Nicolás 2026-09-23) are invoiced without it —
  // matches their historical invoices, which carried no CIE. No empty "| |".
  return cie
    ? `Paciente ${paciente} | ${cie} | ${sesion}`
    : `Paciente ${paciente} | ${sesion}`
}

// Validate a session is data-complete enough to invoice. Returns a list of
// blocking reasons (empty = ready). We NEVER improvise a fallback here.
function blockingReasons(p, bill) {
  const reasons = []
  // Billing identity needs a cédula/RUC (persona is keyed by cédula in Contífico).
  const ced = bill.key
  if (!ced) {
    reasons.push(bill.source === 'payer'
      ? `payer "${bill.nombre}" has no cédula/contifico_id`
      : 'patient has no cédula/contifico_id')
  }
  // Diagnosis is NOT a hard requirement — the SRI doesn't need it, and patients
  // without one (Nicolás, 2026-09-23) are invoiced with a no-CIE descripcion. When
  // a diagnosis IS on file it's included (see buildDescripcion).
  return reasons
}

// Build the full Contífico POST /documento/ payload for a session. This is the
// exact object that would be sent (dry-run returns it verbatim).
// Core payload assembler shared by real (session) invoices and the $1 dummy.
// `bill` = { key, razon_social, nombre, telefono, email } ; direccion defaults Quito.
export function buildPayloadCore({ bill, precio, fecha, descripcion }) {
  const key = String(bill.key || '')
  // Persona type: 13-digit → RUC (R), else natural (N). Our personas are keyed by
  // the 10-digit contifico_id, so this is 'N' in practice.
  const isRuc = key.length === 13
  const detalle = {
    producto_id: SESION_PRODUCT.id,
    cantidad: 1,
    precio,
    porcentaje_iva: 0,
    porcentaje_descuento: 0,
    base_cero: precio,
    base_gravable: 0,
    base_no_gravable: 0,
  }
  return {
    // `documento` (sequential) and `autorizacion` are intentionally OMITTED:
    // for electronic docs Contífico auto-assigns the sequential from the POS's
    // establecimiento/punto de emisión, and the SRI clave is filled by PUT /sri/.
    pos: POS_TOKEN,
    // Always TODAY (SRI rule) — `fecha` (session date) is only used in descripcion.
    fecha_emision: fechaDMY(todayEcuador()),
    tipo_documento: 'FAC',
    // electronico:true tells Contífico to generate the SRI clave de acceso itself
    // (via PUT /sri/). WITHOUT it, Contífico treats the doc as a recorded paper
    // invoice and demands a pre-existing `autorizacion` (cod_error 1005). All 291
    // existing invoices carry electronico:true.
    electronico: true,
    estado: 'P',                // Pendiente / por cobrar — mirrors all 291 existing invoices
    caja_id: null,
    cliente: {
      tipo: isRuc ? 'R' : 'N',
      ruc: isRuc ? key : '',
      cedula: key,
      razon_social: (bill.razon_social || bill.nombre || '').toUpperCase(),
      telefonos: bill.telefono || '',
      // RULE (Nicolás 2026-10-02): every factura's dirección is Quito. Keep it.
      direccion: bill.direccion || 'Quito',
      email: bill.email || '',
      es_extranjero: false,
    },
    descripcion,
    referencia: descripcion,    // recon: Observaciones mirrored verbatim to referencia
    subtotal_0: precio,
    subtotal_12: 0,
    iva: 0,
    ice: 0,
    servicio: 0,
    total: precio,
    detalles: [detalle],
    // No `cobros`: the practice emits facturas as "por cobrar" (estado P) and
    // tracks payment separately — matches every existing invoice (cobros:[]).
  }
}

// Build the full Contífico POST /documento/ payload for a session.
function buildDocumentPayload(p, session) {
  return buildPayloadCore({
    bill: billingIdentity(p),
    precio: money(session.monto),
    fecha: session.fecha,
    descripcion: buildDescripcion(p, session),
  })
}

// Compute the next electronic sequential for a punto de emisión: max existing
// number on that prefix + 1, zero-padded to 9 digits. Contífico is the source of
// truth, so this is re-read right before every emission (concurrency-safe).
async function nextDocumentNumber(prefix) {
  const r = await cfGet('/documento/')
  if (!r.ok || !Array.isArray(r.body)) {
    throw new Error('could not read documents to compute next number: ' + r.status)
  }
  let max = 0
  for (const d of r.body) {
    const m = String(d?.documento || '').match(/^(\d{3}-\d{3})-(\d+)$/)
    if (m && m[1] === prefix) { const s = parseInt(m[2], 10); if (s > max) max = s }
  }
  return `${prefix}-${String(max + 1).padStart(9, '0')}`
}

// POST /documento/ (create) → PUT /documento/<id>/sri/ (emit to SRI). Returns
// { ok, contifico_id, sri, error, step }. Does NOT mark facturada (callers do).
// Assigns the next sequential `documento` number just before POSTing.
export async function emitPayload(payload) {
  try {
    payload.documento = await nextDocumentNumber(PUNTO_EMISION)
  } catch (e) {
    return { ok: false, step: 'nextDocumentNumber', error: String(e) }
  }
  const created = await cfPost('/documento/', payload)
  if (!created.ok || !created.body?.id) {
    return { ok: false, step: 'POST /documento/', status: created.status,
      error: 'create failed', response: created.body }
  }
  const docId = created.body.id
  const sri = await cfPut(`/documento/${docId}/sri/`, {})
  if (!sri.ok) {
    return { ok: false, step: 'PUT /documento/<id>/sri/', contifico_id: docId,
      status: sri.status, error: 'SRI emission failed', response: sri.body }
  }
  return { ok: true, contifico_id: docId, sri: sri.body,
    urls: { ride: created.body.url_ride || sri.body?.url_ride || null,
            xml: created.body.url_xml || sri.body?.url_xml || null } }
}

// One assembled work item per eligible session.
export function assemble(sessions) {
  return sessions.map((s) => {
    const p = s.patient
    const bill = billingIdentity(p)
    const reasons = blockingReasons(p, bill)
    return {
      session_id: s.id,
      fecha: s.fecha,
      monto: money(s.monto),
      patient: patientDisplayName(p),
      billing_to: bill.nombre + (bill.source === 'payer' ? ' (payer)' : ''),
      billing_cedula: bill.key || null,
      ready: reasons.length === 0,
      blocking: reasons,
      descripcion: buildDescripcion(p, s),
      payload: buildDocumentPayload(p, s),
    }
  })
}

// Emit ONE assembled item: POST create → PUT sri → mark facturada. Returns a
// per-session result. Never throws (so a batch can continue + report).
export async function emitOne(supabase, item) {
  if (!item.ready) {
    return { session_id: item.session_id, emitted: false, error: 'not ready: ' + item.blocking.join('; ') }
  }
  if (!SESION_PRODUCT.id) {
    return { session_id: item.session_id, emitted: false, error: 'SESION_PRODUCT.id not configured (run recon)' }
  }

  // 1+2) Create the document then submit to the SRI (the irreversible emission).
  const em = await emitPayload(item.payload)
  if (!em.ok) {
    return { session_id: item.session_id, emitted: false, ...em }
  }

  // 3) Mark facturada IMMEDIATELY. An emitted-but-unmarked invoice risks a
  //    duplicate next run — treat any failure here as CRITICAL and shout it.
  const { error: markErr } = await supabase
    .from('sessions').update({ facturada: true, contifico_doc_id: em.contifico_id }).eq('id', item.session_id)
  if (markErr) {
    return { session_id: item.session_id, emitted: true, contifico_id: em.contifico_id,
      marked_facturada: false,
      error: 'CRITICAL: invoice EMITTED but facturada mark FAILED — mark manually before re-running',
      mark_error: markErr.message }
  }

  return { session_id: item.session_id, emitted: true, contifico_id: em.contifico_id,
    marked_facturada: true, urls: em.urls }
}


// ── WhatsApp delivery of the RIDE (factura PDF) ─────────────────────────────
// Invoiced sessions whose PDF hasn't been WhatsApp'd yet (floor-bounded).
async function fetchUnsentRides(supabase, { ignoreFloor = false } = {}) {
  let query = supabase
    .from('sessions')
    .select(`
      id, fecha, monto, contifico_doc_id, factura_enviada_at,
      patient:patients!inner (
        id, nombre, apellido, tipo_paciente, nombre_2, apellido_2, nombre_factura, telefono,
        facturar_desde,
        payer:payers ( id, nombre, apellido, telefono )
      )
    `)
    .eq('facturada', true)
    .not('contifico_doc_id', 'is', null)
    .is('factura_enviada_at', null)
    .order('fecha', { ascending: true })
  if (!ignoreFloor) query = query.gte('fecha', FACTURAR_SINCE)
  const { data, error } = await query
  if (error) throw new Error('supabase unsent-rides query failed: ' + error.message)
  return data || []
}

const firstWord = (v) => String(v || '').trim().split(/\s+/)[0] || ''
const plain = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// Recipient = payer (if it has a phone), else the patient record's phone.
// detalle = "tu sesión del 25 de septiembre" when the recipient IS the patient,
// else "la sesión de {Paciente} del …" (e.g. Laura receiving Raguel's invoice).
function rideRecipient(s) {
  const p = s.patient
  const payerPhone = normalizePhone(p.payer?.telefono)
  const patientPhone = normalizePhone(p.telefono)
  const viaPayer = !!payerPhone
  const to = payerPhone || patientPhone
  // Greeting name: the payer's, else the patient record's person 1 — taken from
  // nombre_factura when set on a non-menor (it's the clean spelling, e.g. "Cecilia"
  // where the record says "Cecília").
  const nombre = firstWord(viaPayer ? p.payer.nombre
    : (p.tipo_paciente !== 'menor' && p.nombre_factura ? p.nombre_factura : p.nombre))
  const paciente = firstWord(patientDisplayName(p))
  const fecha = fechaTexto(s.fecha).toLowerCase()
  const detalle = plain(nombre) === plain(paciente)
    ? `tu sesión del ${fecha}`
    : `la sesión de ${paciente} del ${fecha}`
  return { to, nombre, detalle, via: viaPayer ? 'payer' : 'patient',
    to_last4: to ? to.slice(-4) : null }
}

export async function ridePlan(supabase, onlyId, { floor = false } = {}) {
  // No date floor for manual SENDING: contifico_doc_id is only ever set by this
  // function's own emissions, so explicitly back-invoiced sessions (pre-floor) are
  // included. The automatic sweep (#47) passes floor=true: only sessions with
  // fecha >= coalesce(patient.facturar_desde, FACTURAR_SINCE), filtered BEFORE
  // any Contífico lookup.
  let rows = await fetchUnsentRides(supabase, { ignoreFloor: true })
  if (onlyId) rows = rows.filter((r) => r.id === onlyId)
  if (floor) rows = rows.filter((r) => r.fecha >= (r.patient.facturar_desde || FACTURAR_SINCE))
  const plan = []
  for (const s of rows) {
    const r = rideRecipient(s)
    const d = await cfGet(`/documento/${encodeURIComponent(s.contifico_doc_id)}/`)
    const doc = d.ok ? d.body : null
    const blocking = []
    if (!d.ok) blocking.push(`contifico lookup ${d.status}`)
    if (doc && !doc.autorizacion) blocking.push('not yet SRI-authorized')
    if (doc && !doc.url_ride) blocking.push('no RIDE url')
    if (!r.to) blocking.push('no phone on payer or patient')
    plan.push({
      session_id: s.id, fecha: s.fecha, patient: patientDisplayName(s.patient),
      documento: doc?.documento || null, ride: doc?.url_ride || null,
      recipient: { nombre: r.nombre, via: r.via, to_last4: r.to_last4 }, detalle: r.detalle,
      _to: r.to, ready: blocking.length === 0, blocking,
    })
  }
  return plan
}

// Dry-run core: eligible sessions → assembled items, split ready/blocked.
// ZERO Contífico calls. `ignoreFloor` is inspection-only (dry-run ?all=1).
export async function dryRun(supabase, { ignoreFloor = false } = {}) {
  const [sessions, enEspera] = await Promise.all([fetchEligible(supabase, { ignoreFloor }), fetchEnEspera(supabase)])
  const items = assemble(sessions)
  return { items, ready: items.filter((i) => i.ready), blocked: items.filter((i) => !i.ready), enEspera }
}

// WhatsApp each READY ride-plan item to its billing party and stamp
// factura_enviada_at so nobody gets one twice. Returns per-item results.
export async function sendRides(supabase, plan) {
  const results = []
  for (const item of plan.filter((i) => i.ready)) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const wamid = await sendFactura(item._to, {
        nombre: item.recipient.nombre, detalle: item.detalle, rideUrl: item.ride,
        filename: `Factura ${item.documento}.pdf`,
      })
      // eslint-disable-next-line no-await-in-loop
      const { error: e } = await supabase.from('sessions')
        .update({ factura_enviada_at: new Date().toISOString() }).eq('id', item.session_id)
      results.push({ session_id: item.session_id, documento: item.documento, sent: true, wamid,
        stamped: !e, ...(e ? { error: 'SENT but factura_enviada_at stamp FAILED — stamp by hand: ' + e.message } : {}) })
    } catch (err) {
      results.push({ session_id: item.session_id, documento: item.documento, sent: false, error: String(err.message || err) })
    }
  }
  return results
}
