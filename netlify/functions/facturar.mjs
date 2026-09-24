// netlify/functions/facturar.mjs
//
// Contífico invoicing engine for Efimeramente — the API replacement for the old
// Chrome-automation `/facturar`. Modern Netlify Function (default export,
// Request/Response). Driven by the `/facturar` slash command via HTTP.
//
// api.contifico.com is only reachable from Netlify functions, so ALL Contífico
// traffic runs here, server-side. Auth shape (confirmed in the 2026-09-23 recon):
//   header  Authorization: <CONTIFICO_API_KEY>   (raw sync key, NO "Bearer")
//   base    https://api.contifico.com/sistema/api/v1
//   pos     the CONTIFICO_POS_TOKEN — required only for document creation.
//
// ── SAFETY MODEL ────────────────────────────────────────────────────────────
// This function CAN emit real, SRI-authorized legal documents that cannot be
// quietly undone. Three guards, all required:
//   1. ?token=<GUARD_TOKEN>  — anything else 404s (obscurity, like cf-probe).
//   2. ?mode=<mode>          — dry-run is the DEFAULT and never calls Contífico.
//   3. ?confirm=<phrase>     — emit-one / batch each need an explicit phrase.
// Emission order per session is POST /documento/ (creates) → PUT /documento/<id>/sri/
// (submits to the SRI). Immediately after a successful SRI emission the session
// is stamped facturada=true. An emitted-but-unmarked invoice is the worst
// failure mode (a duplicate next run), so the mark is guarded explicitly and any
// mark failure is reported as CRITICAL.
//
// Modes:
//   recon    — GET-only Contífico exploration (products, a sample document,
//              persona lookup by cédula). Never writes anything.
//   dry-run  — (DEFAULT) read Supabase eligible sessions, resolve billing
//              identity, build the FULL Contífico payload for each, return them.
//              Zero Contífico calls. Flags every data gap; emits nothing.
//   emit-one — ?session_id=<uuid>&confirm=EMIT-ONE — emit exactly one invoice.
//   batch    — ?confirm=EMIT-BATCH — emit every ready-and-eligible session.

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'

const GUARD_TOKEN = '7a3205d04e9055a6cec1489c69e5c81e8c4eb3c6fbd7f183'
const BASE = 'https://api.contifico.com/sistema/api/v1'
const API_KEY = process.env.CONTIFICO_API_KEY || ''
const POS_TOKEN = process.env.CONTIFICO_POS_TOKEN || ''
const SUPABASE_PROJECT = 'vnityzpuhnkumsyfnskz'

// Product to invoice. Filled in from `mode=recon` (?resource=productos) before
// the first dry-run so the payload is exact. IVA 0% (psychology is exempt).
// producto_id is Contífico's internal product id for "SESION INDIVIDUAL".
const SESION_PRODUCT = {
  id: 'O8bYEmDllFv68b7j', // Contífico producto id for SESION INDIVIDUAL (recon 2026-09-24)
  nombre: 'SESION INDIVIDUAL',
}

// Go-live floor: the protocol is NON-retroactive (Nicolás, 2026-09-23). Every
// session BEFORE this date was already invoiced in real life, so the API path
// must never touch them. Eligibility is hard-floored at this date on session
// `fecha`. Do not lower it — it is the wall that stops the historical backlog
// from being re-emitted.
const FACTURAR_SINCE = '2026-09-24'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  })

// 'YYYY-MM-DD' → "4 de Septiembre" (capitalized month, no year — matches the
// insurance format observed on real invoices). Parsed by parts to avoid TZ drift.
function fechaTexto(fechaStr) {
  const [, m, d] = String(fechaStr || '').split('-').map(Number)
  if (!m || !d) return String(fechaStr || '')
  return `${d} de ${MESES[m - 1] || ''}`.trim()
}

// 'YYYY-MM-DD' → 'DD/MM/YYYY' (Contífico fecha_emision format).
function fechaDMY(fechaStr) {
  const [y, m, d] = String(fechaStr || '').split('-')
  if (!y || !m || !d) return String(fechaStr || '')
  return `${d}/${m}/${y}`
}

const money = (n) => Number(Number(n).toFixed(2))

// ── Contífico HTTP ──────────────────────────────────────────────────────────
function cfHeaders() {
  return { 'Content-Type': 'application/json', Authorization: API_KEY }
}

async function cfGet(path) {
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
async function fetchEligible(supabase) {
  const { data, error } = await supabase
    .from('sessions')
    .select(`
      id, fecha, monto, tipo, estado, pagado, facturada,
      patient:patients!inner (
        id, nombre, apellido, tipo_paciente, nombre_2, apellido_2,
        cedula, contifico_id, diagnostico_codigo, diagnostico_texto,
        facturacion_obligatoria,
        payer:payers ( id, nombre, apellido, cedula, contifico_id,
                       razon_social, email, telefono )
      )
    `)
    .eq('estado', 'confirmada')
    .eq('pagado', true)
    .neq('tipo', 'llamada')
    .or('facturada.is.null,facturada.eq.false')
    .gte('fecha', FACTURAR_SINCE)   // NON-retroactive: never invoice the pre-go-live backlog
    .eq('patient.facturacion_obligatoria', true)
    .order('fecha', { ascending: true })
  if (error) throw new Error('supabase eligible query failed: ' + error.message)
  // patient.facturacion_obligatoria filter above scopes the embed; keep only rows
  // whose patient survived the inner join and the flag.
  return (data || []).filter((s) => s.patient && s.patient.facturacion_obligatoria === true)
}

// The patient's own display name (always names the PATIENT in the descripcion,
// even when billing goes to a payer). For a menor the patient is the child.
function patientDisplayName(p) {
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
function buildDescripcion(p, session) {
  const paciente = patientDisplayName(p)
  const cie = [p.diagnostico_codigo, p.diagnostico_texto].filter(Boolean).join(' ').trim()
  return `Paciente ${paciente} | ${cie} | Sesión ${fechaTexto(session.fecha)}`
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
  // Diagnosis is required for the insurance descripcion.
  if (!p.diagnostico_codigo && !p.diagnostico_texto) {
    reasons.push('patient has no diagnóstico (CIE code/text)')
  }
  return reasons
}

// Build the full Contífico POST /documento/ payload for a session. This is the
// exact object that would be sent (dry-run returns it verbatim).
// Core payload assembler shared by real (session) invoices and the $1 dummy.
// `bill` = { key, razon_social, nombre, telefono, email } ; direccion defaults Quito.
function buildPayloadCore({ bill, precio, fecha, descripcion }) {
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
    fecha_emision: fechaDMY(fecha),
    tipo_documento: 'FAC',
    estado: 'P',                // Pendiente / por cobrar — mirrors all 291 existing invoices
    caja_id: null,
    cliente: {
      tipo: isRuc ? 'R' : 'N',
      ruc: isRuc ? key : '',
      cedula: key,
      razon_social: (bill.razon_social || bill.nombre || '').toUpperCase(),
      telefonos: bill.telefono || '',
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

// POST /documento/ (create) → PUT /documento/<id>/sri/ (emit to SRI). Returns
// { ok, contifico_id, sri, error, step }. Does NOT mark facturada (callers do).
async function emitPayload(payload) {
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
function assemble(sessions) {
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
async function emitOne(supabase, item) {
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
    .from('sessions').update({ facturada: true }).eq('id', item.session_id)
  if (markErr) {
    return { session_id: item.session_id, emitted: true, contifico_id: em.contifico_id,
      marked_facturada: false,
      error: 'CRITICAL: invoice EMITTED but facturada mark FAILED — mark manually before re-running',
      mark_error: markErr.message }
  }

  return { session_id: item.session_id, emitted: true, contifico_id: em.contifico_id,
    marked_facturada: true, urls: em.urls }
}

// ── Handler ─────────────────────────────────────────────────────────────────
export default async (req) => {
  const url = new URL(req.url)
  if (url.searchParams.get('token') !== GUARD_TOKEN) {
    return new Response('Not found', { status: 404 })
  }
  if (!API_KEY || !POS_TOKEN) {
    return json({ error: 'missing_contifico_env', hasKey: !!API_KEY, hasPos: !!POS_TOKEN }, 500)
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return json({ error: 'missing SUPABASE_SERVICE_KEY' }, 500)

  const mode = url.searchParams.get('mode') || 'dry-run'

  try {
    // ── recon: GET-only Contífico exploration ────────────────────────────────
    if (mode === 'recon') {
      const resource = url.searchParams.get('resource') || 'productos'
      if (resource === 'productos') {
        // Optional ?q= filter on nombre for a smaller response.
        const q = (url.searchParams.get('q') || '').toLowerCase()
        const r = await cfGet('/producto/')
        let body = r.body
        if (Array.isArray(body) && q) {
          body = body.filter((x) => String(x?.nombre || '').toLowerCase().includes(q))
        }
        return json({ mode, resource, status: r.status,
          count: Array.isArray(body) ? body.length : null, body })
      }
      if (resource === 'documento') {
        const id = url.searchParams.get('id')
        const path = id ? `/documento/${id}/` : '/documento/'
        const r = await cfGet(path)
        if (!id && Array.isArray(r.body)) {
          // Summarize the sequence structure: group FAC numbers by establecimiento-
          // punto prefix and report the max sequential per prefix (to compute next).
          const groups = {}
          for (const d of r.body) {
            const num = String(d?.documento || '')
            const m = num.match(/^(\d{3}-\d{3})-(\d+)$/)
            if (!m) continue
            const g = (groups[m[1]] = groups[m[1]] || { count: 0, max: 0, maxDoc: '' })
            g.count++
            const seq = parseInt(m[2], 10)
            if (seq > g.max) { g.max = seq; g.maxDoc = num }
          }
          return json({ mode, resource, status: r.status,
            len: r.body.length, prefixes: groups, first: r.body[0] })
        }
        return json({ mode, resource, id: id || null, status: r.status, body: r.body })
      }
      if (resource === 'persona') {
        const cedula = url.searchParams.get('cedula') || ''
        const r = await cfGet(`/persona/?cedula=${encodeURIComponent(cedula)}`)
        return json({ mode, resource, cedula, status: r.status, body: r.body })
      }
      return json({ error: 'unknown resource', resource }, 400)
    }

    // ── dry-run: build payloads, ZERO Contífico calls ────────────────────────
    if (mode === 'dry-run') {
      const sessions = await fetchEligible(supabase)
      const items = assemble(sessions)
      const ready = items.filter((i) => i.ready)
      const blocked = items.filter((i) => !i.ready)
      return json({
        mode, contifico_calls: 0,
        since: FACTURAR_SINCE,
        product_configured: !!SESION_PRODUCT.id,
        totals: { eligible: items.length, ready: ready.length, blocked: blocked.length },
        blocked: blocked.map((i) => ({
          session_id: i.session_id, fecha: i.fecha, patient: i.patient,
          billing_to: i.billing_to, blocking: i.blocking,
        })),
        ready: ready.map((i) => ({
          session_id: i.session_id, fecha: i.fecha, patient: i.patient,
          billing_to: i.billing_to, monto: i.monto, descripcion: i.descripcion,
        })),
        // Redact the POS token in the echoed payloads — dry-run output is for review.
        full: items.map((i) => ({ ...i, payload: { ...i.payload, pos: '***REDACTED***' } })),
      })
    }

    // ── emit-dummy: one $1 test invoice to a fixed identity ──────────────────
    // Validates the full POST→SRI→verify path without touching any patient
    // session (no facturada mark). Identity + amount are hardcoded to Nicolás's
    // own data at $1 (minimum impact); descripcion uses the real pipe format.
    if (mode === 'emit-dummy') {
      if (url.searchParams.get('confirm') !== 'EMIT-DUMMY') {
        return json({ error: 'refused: emit-dummy requires ?confirm=EMIT-DUMMY' }, 400)
      }
      const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guayaquil' }))
      const fecha = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const descripcion = `Paciente Nicolás De la Torre | F99 prueba de facturación electrónica | Sesión ${fechaTexto(fecha)}`
      const payload = buildPayloadCore({
        bill: {
          key: '1722559331',
          nombre: 'Nicolás De la Torre',
          razon_social: 'NICOLÁS DE LA TORRE',
          telefono: '+593968029896',
          email: 'nicolasdltz97@gmail.com',
          direccion: 'Tumbaco',
        },
        precio: 1,
        fecha,
        descripcion,
      })
      const em = await emitPayload(payload)
      return json({ mode, descripcion, emitted: em.ok, ...em,
        payload: { ...payload, pos: '***REDACTED***' } })
    }

    // ── emit-one: exactly one invoice ────────────────────────────────────────
    if (mode === 'emit-one') {
      if (url.searchParams.get('confirm') !== 'EMIT-ONE') {
        return json({ error: 'refused: emit-one requires ?confirm=EMIT-ONE' }, 400)
      }
      const sessionId = url.searchParams.get('session_id')
      if (!sessionId) return json({ error: 'emit-one requires ?session_id=<uuid>' }, 400)
      const sessions = await fetchEligible(supabase)
      const items = assemble(sessions)
      const item = items.find((i) => i.session_id === sessionId)
      if (!item) return json({ error: 'session not found among current eligible set', session_id: sessionId }, 404)
      const result = await emitOne(supabase, item)
      return json({ mode, result })
    }

    // ── batch: every ready session ───────────────────────────────────────────
    if (mode === 'batch') {
      if (url.searchParams.get('confirm') !== 'EMIT-BATCH') {
        return json({ error: 'refused: batch requires ?confirm=EMIT-BATCH' }, 400)
      }
      const sessions = await fetchEligible(supabase)
      const items = assemble(sessions)
      const ready = items.filter((i) => i.ready)
      const blocked = items.filter((i) => !i.ready)
      const results = []
      for (const item of ready) {
        // eslint-disable-next-line no-await-in-loop
        results.push(await emitOne(supabase, item))
      }
      return json({
        mode,
        totals: { eligible: items.length, ready: ready.length, blocked: blocked.length,
          emitted: results.filter((r) => r.emitted).length,
          failed: results.filter((r) => !r.emitted).length },
        blocked: blocked.map((i) => ({ session_id: i.session_id, patient: i.patient, blocking: i.blocking })),
        results,
      })
    }

    return json({ error: 'unknown mode', mode }, 400)
  } catch (e) {
    return json({ error: String(e), stack: e?.stack?.split('\n').slice(0, 5) }, 500)
  }
}
