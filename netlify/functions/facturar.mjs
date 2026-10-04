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
//   ride-template        — ?variant=document|link&confirm=SUBMIT-TEMPLATE — submit the
//                          WhatsApp factura template for Meta review (lib/facturaWhatsapp.mjs).
//   ride-template-status — Meta review status of the factura templates.
//   send-rides           — WhatsApp each invoiced session's PDF (RIDE) to the billing
//                          party. Plan-only by default; ?confirm=SEND-RIDES sends
//                          (optionally ?session_id=<uuid> for just one). Stamps
//                          sessions.factura_enviada_at so nobody gets one twice.

// The core (eligibility, payload build, emission, RIDE send) lives in
// netlify/lib/facturarCore.mjs — shared with the WhatsApp approval path (#16).
// This file keeps only the HTTP shell: guard token, modes, JSON responses.

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { submitFacturaTemplate, facturaTemplateStatus } from '../lib/facturaWhatsapp.mjs'
import {
  API_KEY, POS_TOKEN, SESION_PRODUCT, FACTURAR_SINCE, fechaTexto, cfGet, fetchEligible,
  assemble, buildPayloadCore, emitPayload, emitOne, ridePlan, sendRides,
} from '../lib/facturarCore.mjs'

// Guard token lives ONLY in the Netlify env (CONTIFICO_FACTURAR_TOKEN, secret,
// production/functions) — NOT in git. This function is permanent and emits legal
// invoices, so the token must not be committed. If the env var is unset the
// function refuses every request (there is no hardcoded fallback).
const GUARD_TOKEN = process.env.CONTIFICO_FACTURAR_TOKEN || ''

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  })

// ── Handler ─────────────────────────────────────────────────────────────────
export default async (req) => {
  const url = new URL(req.url)
  if (!GUARD_TOKEN || url.searchParams.get('token') !== GUARD_TOKEN) {
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
      if (resource === 'descripciones') {
        // Compact read-only dump: every document's descripcion + billing party,
        // for mining diagnoses from past invoices. Optional ?cedula= filter.
        const ced = url.searchParams.get('cedula') || ''
        const r = await cfGet('/documento/')
        if (!Array.isArray(r.body)) return json({ mode, resource, status: r.status, body: r.body })
        let rows = r.body.map((d) => ({
          documento: d?.documento || null,
          cedula: d?.persona?.cedula || null,
          razon_social: d?.persona?.razon_social || null,
          descripcion: d?.descripcion || null,
        }))
        if (ced) rows = rows.filter((x) => x.cedula === ced)
        return json({ mode, resource, status: r.status, count: rows.length, rows })
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
      const ignoreFloor = url.searchParams.get('all') === '1'
      const sessions = await fetchEligible(supabase, { ignoreFloor })
      const items = assemble(sessions)
      const ready = items.filter((i) => i.ready)
      const blocked = items.filter((i) => !i.ready)
      return json({
        mode, contifico_calls: 0,
        since: FACTURAR_SINCE,
        floor_ignored: ignoreFloor,   // ?all=1 — inspection only; emit paths always honor the floor
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
      // &before_floor=1 — invoice ONE named session dated before FACTURAR_SINCE (a missed
      // one Nicolás asks for explicitly, e.g. 2026-10-03 backlog for Laura/Cecilia). Only
      // emit-one honors it; batch always keeps the floor, so the backlog is never swept.
      const beforeFloor = url.searchParams.get('before_floor') === '1'
      const sessions = await fetchEligible(supabase, { ignoreFloor: beforeFloor })
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

    // ── WhatsApp factura template: submit + status ───────────────────────────
    if (mode === 'ride-template') {
      if (url.searchParams.get('confirm') !== 'SUBMIT-TEMPLATE') {
        return json({ error: 'refused: ride-template requires ?confirm=SUBMIT-TEMPLATE' }, 400)
      }
      const variant = url.searchParams.get('variant') === 'link' ? 'link' : 'document'
      const { data: last } = await supabase.from('sessions').select('contifico_doc_id')
        .not('contifico_doc_id', 'is', null).order('fecha', { ascending: false }).limit(1)
      const docId = last?.[0]?.contifico_doc_id
      if (!docId) return json({ error: 'no emitted invoice to use as the sample PDF' }, 400)
      const d = await cfGet(`/documento/${encodeURIComponent(docId)}/`)
      if (!d.ok || !d.body?.url_ride) return json({ error: 'sample RIDE not available', status: d.status }, 502)
      return json({ mode, ...(await submitFacturaTemplate(variant, d.body.url_ride)) })
    }
    if (mode === 'ride-template-status') {
      return json({ mode, ...(await facturaTemplateStatus()) })
    }

    // ── send-rides: WhatsApp each factura PDF to its billing party ───────────
    if (mode === 'send-rides') {
      const onlyId = url.searchParams.get('session_id') || null
      const plan = await ridePlan(supabase, onlyId)
      const strip = ({ _to, ...rest }) => rest
      if (url.searchParams.get('confirm') !== 'SEND-RIDES') {
        return json({ mode, sent: 0, note: 'plan only — add ?confirm=SEND-RIDES to send',
          totals: { pending: plan.length, ready: plan.filter((i) => i.ready).length },
          plan: plan.map(strip) })
      }
      const results = await sendRides(supabase, plan)
      return json({ mode, totals: { pending: plan.length, sent: results.filter((r) => r.sent).length,
        failed: results.filter((r) => !r.sent).length, skipped: plan.filter((i) => !i.ready).length },
        skipped: plan.filter((i) => !i.ready).map(strip), results })
    }

    return json({ error: 'unknown mode', mode }, 400)
  } catch (e) {
    return json({ error: String(e), stack: e?.stack?.split('\n').slice(0, 5) }, 500)
  }
}
