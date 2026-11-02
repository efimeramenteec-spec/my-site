// netlify/lib/payrollFlow.mjs
//
// Monthly therapist payroll, automatic (#48 — workflow agreed with Nicolás 2 Nov 2026):
//   1. startPayroll: template `conteo_sesiones` ("Hola X! Por favor envíame por aquí tu conteo de sesiones del mes
//      de octubre…") to each therapist on payroll (provision_rate > 0, activo; Mariana keeps 100% → never).
//      `skip` names (list already received) get a row without a template. One payroll_runs row each, pendiente_lista.
//   2. runPayrollCheck (hourly, payroll-check → payroll-check-background, under withCronLock): reads each pending
//      therapist's inbound WhatsApps since the month's last days (text + images, via the vision model), and as soon
//      as a count is there:
//   3. MATCH = SESSION COUNT ONLY (Nicolás 2 Nov: dates/patients don't matter, this is only for payment) vs the
//      system's confirmed non-llamada sessions of the month →
//   4. equal → matchMessage + system PDF (sessionReport.js) from the 9933 → enviado_ok.
//      different → ONE WhatsApp to Nicolás (notifyOwner) → mismatch. He fixes, then recheck → pendiente_lista again.
//      Unreadable reply (audio, document, ambiguous) → Nicolás told once.
//   5. 24 h after the template, still nothing → ONE WhatsApp to Nicolás listing who hasn't sent.
// The bank deposit stays with Nicolás. Payroll copy never goes through cleanBotText (🐚✨ signature).

import { matchMessage } from './payrollCopy.mjs'
import { normalizePhone } from './whatsapp.mjs'
import { mediaIdOf, fetchDualhookMedia } from './waMedia.mjs'
import { parseModelJson } from './proofOcr.mjs'
import { sendStaffText, sendStaffDocument } from './waSend.mjs'
import { sendConteoSesiones, listTemplates, CONTEO_SESIONES_TEMPLATE } from './leadTemplates.mjs'
import { notifyOwner } from './ownerOutbox.mjs'
import { downloadSessionReport } from '../../src/lib/sessionReport.js'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const H = 3600e3
const BUCKET = 'payroll'
const APIMART_URL = 'https://api.apimart.ai/v1/chat/completions'
const MODEL = 'claude-opus-4-8' // same vision model as the receipt reader
const SITE = 'https://efimeramente-panel.netlify.app'
const LOGO_URL = `${SITE}/logos/LOGOTIPOLARGO%20(1).png`

export const mesDe = (periodo) => MESES[Number(String(periodo).slice(5, 7)) - 1] || periodo
export function periodoRange(periodo) {
  const [y, m] = String(periodo).split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { desde: `${periodo}-01`, hasta: `${periodo}-${String(last).padStart(2, '0')}` }
}
// Messages that can carry the count: from 2 days before the month ends (Daniela sent hers on the 1st).
function lookbackStart(periodo) {
  const { hasta } = periodoRange(periodo)
  return new Date(new Date(`${hasta}T00:00:00-05:00`).getTime() - 2 * 24 * H).toISOString()
}
const last9 = (s) => String(s || '').replace(/\D/g, '').slice(-9)
const money = (n) => `$${Number.isInteger(Number(n)) ? Number(n) : Number(n).toFixed(2)}`

const PROMPT = (nombre, mes) => `Eres el asistente de nómina de un consultorio de psicología. La terapeuta/el terapeuta ${nombre} debía enviar por WhatsApp su conteo de sesiones del mes de ${mes}. Abajo están sus mensajes recientes (texto y/o capturas, en orden). Decide si contienen ese conteo.

Devuelve ÚNICAMENTE un JSON válido, sin texto adicional:
{
  "tiene_conteo": boolean,   // true si en los mensajes está el conteo o la lista de sesiones de ${mes}
  "conteo": number|null,     // total de sesiones que declara; si manda una lista sin total, cuenta los ítems (cada sesión = 1)
  "ambiguo": boolean,        // true si el total escrito y la lista no coinciden, o no se puede saber con certeza
  "nota": string             // una frase corta en español explicando de dónde sale el número
}
Si los mensajes son de otros temas, tiene_conteo=false. No inventes.`

export const defaultDeps = {
  now: () => new Date(),
  templateApproved: async () => {
    const out = await listTemplates()
    return (out.templates || []).some((t) => t.name === CONTEO_SESIONES_TEMPLATE && t.status === 'APPROVED')
  },
  sendTemplate: sendConteoSesiones,
  sendText: sendStaffText,
  sendDocument: sendStaffDocument,
  notifyOwner,
  fetchMedia: fetchDualhookMedia,
  // messages: [{ type:'text', text } | { type:'image', b64, mime }]
  async readCount({ nombre, mes, messages }) {
    const apiKey = process.env.APIMART_API_KEY
    if (!apiKey) throw new Error('APIMART_API_KEY missing')
    const content = [{ type: 'text', text: PROMPT(nombre, mes) }]
    for (const m of messages) {
      if (m.type === 'text') content.push({ type: 'text', text: `Mensaje: ${m.text}` })
      else content.push({ type: 'image_url', image_url: { url: `data:${m.mime};base64,${m.b64}` } })
    }
    const res = await fetch(APIMART_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, stream: false, max_tokens: 400, messages: [{ role: 'user', content }] }),
    })
    if (!res.ok) throw new Error(`APIMart ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    const out = parseModelJson(data?.choices?.[0]?.message?.content)
    if (!out) throw new Error('unparseable model output')
    return out
  },
  async buildPdf(supabase, therapist, therapists, periodo) {
    const { desde, hasta } = periodoRange(periodo)
    const { data: sessions, error } = await supabase.from('sessions')
      .select('id,patient_id,terapeuta_id,fecha,hora_inicio,hora_fin,tipo,modalidad,estado,monto,pagado,facturada,' +
        'patient:patients(id,nombre,apellido,nombre_2,apellido_2,tipo_paciente)')
      .eq('terapeuta_id', therapist.id).eq('estado', 'confirmada').neq('tipo', 'llamada').gte('fecha', desde).lte('fecha', hasta)
    if (error) throw new Error('report sessions: ' + error.message)
    let logo = null
    try {
      const png = Buffer.from(await (await fetch(LOGO_URL)).arrayBuffer())
      logo = { dataUrl: 'data:image/png;base64,' + png.toString('base64'), w: png.readUInt32BE(16), h: png.readUInt32BE(20) }
    } catch (e) { console.warn('[payroll] logo fetch failed (report without logo):', e.message) }
    const r = await downloadSessionReport({
      sessions, therapists, filters: { terapeuta: therapist.id, estado: 'confirmada', desde, hasta },
      terapeutaName: [therapist.nombre, therapist.apellido].filter(Boolean).join(' '), logo, save: false,
    })
    if (!r.ok) throw new Error(r.error)
    return { bytes: Buffer.from(r.pdf), count: r.count, pay: r.pay }
  },
}

async function payrollTherapists(supabase) {
  const { data, error } = await supabase.from('therapists').select('id,nombre,apellido,telefono,activo,provision_rate,prueba_hasta')
  if (error) throw new Error('therapists: ' + error.message)
  return data || []
}
const onPayroll = (t) => t.activo !== false && Number(t.provision_rate ?? 24) > 0 && normalizePhone(t.telefono)

export async function systemCount(supabase, terapeutaId, periodo) {
  const { desde, hasta } = periodoRange(periodo)
  const { count, error } = await supabase.from('sessions').select('id', { count: 'exact', head: true })
    .eq('terapeuta_id', terapeutaId).eq('estado', 'confirmada').neq('tipo', 'llamada').gte('fecha', desde).lte('fecha', hasta)
  if (error) throw new Error('system count: ' + error.message)
  return count || 0
}

// Step 1. skip = therapist names whose list already arrived (row, no template). live=false → plan only.
export async function startPayroll(supabase, { periodo, skip = [], only = null, live = false }, deps = defaultDeps) {
  const mes = mesDe(periodo)
  const ther = (await payrollTherapists(supabase)).filter(onPayroll)
    .filter((t) => !only || only.includes(t.nombre))
  const { data: existing } = await supabase.from('payroll_runs').select('terapeuta_id, estado').eq('periodo', periodo)
  const have = new Map((existing || []).map((r) => [r.terapeuta_id, r.estado]))
  const plan = ther.map((t) => ({
    nombre: t.nombre, accion: have.has(t.id) ? `ya existe (${have.get(t.id)})` : skip.includes(t.nombre) ? 'sin plantilla (lista ya recibida)' : 'plantilla',
  }))
  if (!live) return { periodo, mes, live: false, plan }
  if (plan.some((p) => p.accion === 'plantilla') && !(await deps.templateApproved())) {
    return { periodo, mes, live: true, error: 'conteo_sesiones aún no está APPROVED en Meta — nada enviado', plan }
  }
  const nowIso = deps.now().toISOString()
  for (const t of ther) {
    const p = plan.find((x) => x.nombre === t.nombre)
    if (have.has(t.id)) continue
    const row = { periodo, terapeuta_id: t.id, estado: 'pendiente_lista', detalle: {} }
    if (p.accion === 'plantilla') {
      try {
        row.pedido_wamid = await deps.sendTemplate(normalizePhone(t.telefono), { nombre: t.nombre, mes })
        row.pedido_at = nowIso
      } catch (e) { p.error = e.message; continue }
    }
    const { error } = await supabase.from('payroll_runs').insert(row)
    if (error) p.error = 'row insert: ' + error.message
    else p.ok = true
  }
  return { periodo, mes, live: true, plan }
}

// Inbound messages from a therapist since `sinceIso` (oldest first).
async function inboundFrom(supabase, telefono, sinceIso) {
  const { data, error } = await supabase.from('whatsapp_messages')
    .select('id, received_at, raw_payload').eq('direccion', 'inbound').gte('received_at', sinceIso)
    .order('received_at', { ascending: true }).limit(500)
  if (error) throw new Error('inbound: ' + error.message)
  const want = last9(telefono)
  return (data || []).filter((m) => last9(m.raw_payload?.message?.from) === want)
}

// Step 2–5. One pass over every pending row.
export async function runPayrollCheck(supabase, deps = defaultDeps) {
  const now = deps.now()
  const report = { checked: 0, matched: [], mismatched: [], unreadable: [], waiting: [], noListAlerts: [] }
  const { data: rows, error } = await supabase.from('payroll_runs').select('*').eq('estado', 'pendiente_lista')
  if (error) throw new Error('payroll_runs: ' + error.message)
  if (!rows?.length) return report
  const therapists = await payrollTherapists(supabase)
  const byId = new Map(therapists.map((t) => [t.id, t]))

  for (const row of rows) {
    try { await checkOne(supabase, row, byId, therapists, now, report, deps) }
    catch (e) {
      // One therapist can't stop the others; the error shows in payroll-run?action=status.
      console.error('[payroll] row failed:', e.message)
      await supabase.from('payroll_runs').update({ detalle: { ...(row.detalle || {}), ultimo_error: { at: now.toISOString(), paso: 'proceso', error: String(e.message).slice(0, 300) } } }).eq('id', row.id)
    }
  }
  await noListNotice(supabase, byId, now, report, deps)
  return report
}

async function checkOne(supabase, row, byId, therapists, now, report, deps) {
  {
    const t = byId.get(row.terapeuta_id)
    if (!t) return
    report.checked++
    const mes = mesDe(row.periodo)
    const msgs = await inboundFrom(supabase, t.telefono, lookbackStart(row.periodo))
    const newest = msgs.length ? msgs[msgs.length - 1].received_at : null
    // Nothing new since the last read → only the 24 h "no list" notice can apply.
    if (!newest || (row.revisado_hasta && new Date(newest) <= new Date(row.revisado_hasta))) {
      report.waiting.push(t.nombre)
      return
    }
    // Build the model input: text + images. Audio/documents can't be read reliably.
    const input = []
    let unreadableKinds = []
    const mediaErrors = []
    for (const m of msgs) {
      const msg = m.raw_payload?.message || {}
      if (msg.type === 'text' && msg.text?.body) input.push({ type: 'text', text: msg.text.body })
      else if (msg.type === 'image') {
        try {
          const { buffer, contentType } = await deps.fetchMedia(mediaIdOf(msg))
          input.push({ type: 'image', b64: Buffer.from(buffer).toString('base64'), mime: contentType.startsWith('image/') ? contentType : 'image/jpeg' })
          if (msg.image?.caption) input.push({ type: 'text', text: msg.image.caption })
        } catch (e) { unreadableKinds.push('imagen'); mediaErrors.push(String(e.message).slice(0, 200)); console.warn('[payroll] media fetch failed:', e.message) }
      } else if (msg.type === 'audio' || msg.type === 'document') unreadableKinds.push(msg.type === 'audio' ? 'audio' : 'documento')
    }
    // A screenshot we couldn't download may BE the list → don't judge from the text alone; retry next hour.
    if (mediaErrors.length) {
      await supabase.from('payroll_runs').update({ detalle: { ...(row.detalle || {}), ultimo_error: { at: now.toISOString(), paso: 'imagen', error: mediaErrors[0] } } }).eq('id', row.id)
      report.waiting.push(t.nombre)
      return
    }
    let read = null
    if (input.length) {
      try { read = await deps.readCount({ nombre: t.nombre, mes, messages: input }) }
      catch (e) {
        // Retry next hour (no revisado_hasta stamp); the error is visible in payroll-run?action=status.
        console.error('[payroll] readCount failed:', e.message)
        await supabase.from('payroll_runs').update({ detalle: { ...(row.detalle || {}), ultimo_error: { at: now.toISOString(), paso: 'lectura', error: String(e.message).slice(0, 300) } } }).eq('id', row.id)
        report.waiting.push(t.nombre)
        return
      }
    }
    const stamp = { revisado_hasta: newest, updated_at: now.toISOString() }

    if (!read?.tiene_conteo || read.conteo == null || read.ambiguo) {
      // Nothing usable yet. Tell Nicolás only if there's something he must look at himself.
      if ((unreadableKinds.length || read?.ambiguo) && !row.aviso_owner_at) {
        const why = read?.ambiguo ? `su mensaje es ambiguo (${read.nota || 'no se puede saber el total'})` : `mandó ${[...new Set(unreadableKinds)].join(' y ')} que no puedo leer`
        await deps.notifyOwner(supabase, { kind: 'nomina_revisar', resumen: `Nómina ${mes}: revisa a ${t.nombre}`.slice(0, 90),
          messages: [{ type: 'text', body: `Nómina de ${mes}: ${t.nombre} ${why}. Revísalo tú y dime cuántas sesiones reporta.` }] })
        stamp.aviso_owner_at = now.toISOString()
        report.unreadable.push(t.nombre)
      } else report.waiting.push(t.nombre)
      await supabase.from('payroll_runs').update(stamp).eq('id', row.id)
      return
    }

    const sistema = await systemCount(supabase, t.id, row.periodo)
    const conteo = Math.round(Number(read.conteo))
    stamp.conteo_terapeuta = conteo
    stamp.detalle = { ...(row.detalle || {}), lectura: { conteo, nota: read.nota || null, at: now.toISOString() }, sistema }

    if (conteo !== sistema) {
      await deps.notifyOwner(supabase, { kind: 'nomina_revisar', resumen: `Nómina ${mes}: ${t.nombre} ${conteo} vs sistema ${sistema}`.slice(0, 90),
        messages: [{ type: 'text', body: `Nómina de ${mes}: ${t.nombre} reporta ${conteo} sesiones y el sistema tiene ${sistema}. Revisa su reporte; cuando esté corregido dime "revisa a ${t.nombre}" y se lo envío.` }] })
      await supabase.from('payroll_runs').update({ ...stamp, estado: 'mismatch', aviso_owner_at: now.toISOString() }).eq('id', row.id)
      report.mismatched.push({ nombre: t.nombre, conteo, sistema })
      return
    }

    // MATCH → message + PDF. The PDF goes out as a plain message: their 24 h window is open (they just wrote).
    const to = normalizePhone(t.telefono)
    const windowOpen = now.getTime() - new Date(newest).getTime() < 23 * H
    if (!windowOpen) {
      // Can't send freely any more — Nicolás forwards it, or the next message from them reopens it.
      if (!row.aviso_owner_at) {
        await deps.notifyOwner(supabase, { kind: 'nomina_revisar', resumen: `Nómina ${mes}: ${t.nombre} cuadra, ventana cerrada`.slice(0, 90),
          messages: [{ type: 'text', body: `Nómina de ${mes}: ${t.nombre} cuadra (${conteo} sesiones) pero su WhatsApp lleva más de 24 h sin escribir y no puedo mandarle el reporte. Apenas escriba algo al 9933 se lo envío.` }] })
        stamp.aviso_owner_at = now.toISOString()
      }
      // revisado_hasta = newest: their NEXT message re-triggers the read, and then the window is open.
      await supabase.from('payroll_runs').update(stamp).eq('id', row.id)
      report.waiting.push(t.nombre)
      return
    }
    const pdf = await deps.buildPdf(supabase, t, therapists, row.periodo)
    const path = `${row.periodo}/${t.nombre.toLowerCase().replace(/\s+/g, '-')}.pdf`
    const up = await supabase.storage.from(BUCKET).upload(path, pdf.bytes, { contentType: 'application/pdf', upsert: true })
    if (up.error) throw new Error('storage upload: ' + up.error.message)
    const sig = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
    if (sig.error) throw new Error('signed url: ' + sig.error.message)
    const body = matchMessage({ nombre: t.nombre, mes, n: pdf.count, monto: money(pdf.pay) })
    const wText = await deps.sendText(to, body, { previewUrl: false })
    const fname = `Efimeramente-Sesiones-${[t.nombre, t.apellido].filter(Boolean).join('-')}-${mes}-${row.periodo.slice(0, 4)}.pdf`.replace(/\s+/g, '-')
    const wPdf = await deps.sendDocument(to, { link: sig.data.signedUrl, filename: fname })
    await supabase.from('payroll_runs').update({
      ...stamp, estado: 'enviado_ok', sesiones: pdf.count, monto: pdf.pay,
      detalle: { ...stamp.detalle, wamids: { mensaje: wText, pdf: wPdf }, pdf_path: `${BUCKET}/${path}` },
    }).eq('id', row.id)
    report.matched.push({ nombre: t.nombre, sesiones: pdf.count, monto: pdf.pay })
  }
}

// 24 h after the template: who still hasn't sent anything → ONE message per periodo.
async function noListNotice(supabase, byId, now, report, deps) {
  {
  const { data: late } = await supabase.from('payroll_runs').select('id, periodo, terapeuta_id, pedido_at')
    .eq('estado', 'pendiente_lista').is('aviso_sin_lista_at', null).is('conteo_terapeuta', null)
    .not('pedido_at', 'is', null).lte('pedido_at', new Date(now.getTime() - 24 * H).toISOString())
  const porPeriodo = new Map()
  for (const r of late || []) {
    if (!porPeriodo.has(r.periodo)) porPeriodo.set(r.periodo, [])
    porPeriodo.get(r.periodo).push(r)
  }
  for (const [periodo, list] of porPeriodo) {
    const names = list.map((r) => byId.get(r.terapeuta_id)?.nombre).filter(Boolean)
    const mes = mesDe(periodo)
    await deps.notifyOwner(supabase, { kind: 'nomina_sin_lista', resumen: `Nómina ${mes}: sin conteo ${names.join(', ')}`.slice(0, 90),
      messages: [{ type: 'text', body: `Nómina de ${mes}: pasaron 24 h y todavía no mandan su conteo: ${names.join(', ')}. Sigo pendiente; apenas llegue lo reviso.` }] })
    await supabase.from('payroll_runs').update({ aviso_sin_lista_at: now.toISOString() }).in('id', list.map((r) => r.id))
    report.noListAlerts.push({ periodo, names })
  }
  }
}

// "revisa a X": back to pendiente_lista so the next pass re-reads everything.
export async function recheckPayroll(supabase, { periodo, nombre }) {
  const t = (await payrollTherapists(supabase)).find((x) => x.nombre.toLowerCase() === String(nombre).toLowerCase())
  if (!t) throw new Error('no therapist ' + nombre)
  const { data, error } = await supabase.from('payroll_runs')
    .update({ estado: 'pendiente_lista', revisado_hasta: null, aviso_owner_at: null, updated_at: new Date().toISOString() })
    .eq('periodo', periodo).eq('terapeuta_id', t.id).in('estado', ['mismatch', 'pendiente_lista']).select('id')
  if (error) throw new Error(error.message)
  return { reset: data?.length || 0 }
}
