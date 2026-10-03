// netlify/lib/facturaWhatsapp.mjs
//
// WhatsApp delivery of a factura's PDF (the Contífico RIDE) to the billing party,
// via Dualhook (Cloud API shape). Used by facturar.mjs modes `ride-template`,
// `ride-template-status` and `send-rides`.
//
// Invoices go out days after the patient last wrote to us, so the send must be a
// Meta-approved TEMPLATE (free-form only works inside the 24h window). Two variants:
//   factura_sesion       — DOCUMENT header: the PDF arrives attached in the chat.
//                          Submitting it needs a sample PDF uploaded to Meta
//                          (Resumable Upload API → header_handle).
//   factura_sesion_link  — fallback if that upload isn't possible through Dualhook:
//                          a "Descargar factura" URL button that opens the RIDE.
// FACTURA_WA_TEMPLATE (env) picks the variant to send; default `factura_sesion`.
//
// Recipient rule (Nicolás 2026-10-02): the PAYER gets it; if the payer has no phone,
// the patient's phone (e.g. Dorian Solis → Cecilia Saltos). Resolved in facturar.mjs.
//
// Env: WA_DUALHOOK_API_KEY.

const DUALHOOK_BASE = 'https://api.dualhook.com/v25.0'
const WABA_ID = '1857507018469524'
const SEND_URL = `${DUALHOOK_BASE}/915558374975708/messages`
const TEMPLATES_URL = `${DUALHOOK_BASE}/${WABA_ID}/message_templates`
const LANG = 'es'

export const DOC_TEMPLATE = 'factura_sesion'
export const LINK_TEMPLATE = 'factura_sesion_link'

// {{1}} = recipient first name · {{2}} = "tu sesión del 25 de septiembre" /
// "la sesión de Valentina del 25 de septiembre". Meta rejects a variable at the
// very end, so the body closes on static text.
const BODY_TEXT = 'Hola {{1}} 🌿 Te enviamos la factura de {{2}}. Gracias por confiar en Efimeramente.'
const BODY_EXAMPLE = [['Laura', 'la sesión de Raguel del 26 de septiembre']]

function apiKey() {
  const k = process.env.WA_DUALHOOK_API_KEY
  if (!k) throw new Error('WA_DUALHOOK_API_KEY missing — nothing sent')
  return k
}

async function readJson(res) {
  const txt = await res.text()
  try { return JSON.parse(txt) } catch { return { raw: txt.slice(0, 500) } }
}

// Resumable Upload API: upload a sample PDF to Meta → header_handle for the
// DOCUMENT-header template example. Returns { ok, handle | error, step }.
async function uploadSampleHandle(sampleUrl) {
  const pdf = await fetch(sampleUrl)
  if (!pdf.ok) return { ok: false, step: 'fetch-sample', error: `sample RIDE ${pdf.status}` }
  const bytes = Buffer.from(await pdf.arrayBuffer())
  const auth = { Authorization: `Bearer ${apiKey()}` }
  const start = await fetch(
    `${DUALHOOK_BASE}/app/uploads?file_name=factura.pdf&file_length=${bytes.length}&file_type=application/pdf`,
    { method: 'POST', headers: auth })
  const s = await readJson(start)
  if (!start.ok || !s.id) return { ok: false, step: 'upload-session', status: start.status, error: s }
  const up = await fetch(`${DUALHOOK_BASE}/${s.id}`, {
    method: 'POST', headers: { ...auth, file_offset: '0' }, body: bytes,
  })
  const u = await readJson(up)
  if (!up.ok || !u.h) return { ok: false, step: 'upload-bytes', status: up.status, error: u }
  return { ok: true, handle: u.h }
}

async function createTemplate(body) {
  const res = await fetch(TEMPLATES_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await readJson(res) }
}

// Submit a template variant for Meta review. `sampleRideUrl` = a real RIDE url
// (the DOCUMENT variant uploads it as the example; the LINK variant derives its
// fixed URL prefix from it).
export async function submitFacturaTemplate(variant, sampleRideUrl) {
  if (variant === 'link') {
    const m = String(sampleRideUrl).match(/^(https:\/\/[^/]+\/sistema\/registro\/documento\/ride\/)(.+)$/)
    if (!m) return { ok: false, error: 'unexpected RIDE url shape — cannot derive button prefix' }
    const r = await createTemplate({
      name: LINK_TEMPLATE, language: LANG, category: 'UTILITY', allow_category_change: false,
      components: [
        { type: 'BODY', text: BODY_TEXT, example: { body_text: BODY_EXAMPLE } },
        { type: 'BUTTONS', buttons: [
          { type: 'URL', text: 'Descargar factura', url: `${m[1]}{{1}}`, example: [sampleRideUrl] },
        ] },
      ],
    })
    return { ok: r.status < 300, variant, name: LINK_TEMPLATE, ...r }
  }
  const up = await uploadSampleHandle(sampleRideUrl)
  if (!up.ok) return { ok: false, variant: 'document', ...up,
    hint: 'Dualhook may not proxy the upload API — submit variant=link instead' }
  const r = await createTemplate({
    name: DOC_TEMPLATE, language: LANG, category: 'UTILITY', allow_category_change: false,
    components: [
      { type: 'HEADER', format: 'DOCUMENT', example: { header_handle: [up.handle] } },
      { type: 'BODY', text: BODY_TEXT, example: { body_text: BODY_EXAMPLE } },
    ],
  })
  return { ok: r.status < 300, variant: 'document', name: DOC_TEMPLATE, ...r }
}

// Current Meta status of both variants.
export async function facturaTemplateStatus() {
  const res = await fetch(`${TEMPLATES_URL}?fields=name,status,category,rejected_reason&limit=200`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  })
  const j = await readJson(res)
  const mine = (j.data || []).filter((t) => t.name === DOC_TEMPLATE || t.name === LINK_TEMPLATE)
  return { status: res.status, templates: mine, error: res.ok ? undefined : j }
}

// Send the factura to one recipient. Returns the wamid. Throws on failure.
export async function sendFactura(toE164, { nombre, detalle, rideUrl, filename }) {
  const template = process.env.FACTURA_WA_TEMPLATE || DOC_TEMPLATE
  const text = (v) => ({ type: 'text', text: String(v || '').trim() || '—' })
  const components = [{ type: 'body', parameters: [text(nombre), text(detalle)] }]
  if (template === LINK_TEMPLATE) {
    const suffix = String(rideUrl).split('/documento/ride/')[1] || ''
    components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: suffix }] })
  } else {
    components.unshift({ type: 'header', parameters: [{ type: 'document', document: { link: rideUrl, filename } }] })
  }
  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: String(toE164).replace(/^\+/, ''),
      type: 'template',
      template: { name: template, language: { code: LANG }, components },
    }),
  })
  const j = await readJson(res)
  if (!res.ok) throw new Error(`Dualhook ${res.status}: ${JSON.stringify(j).slice(0, 300)}`)
  return j?.messages?.[0]?.id || null
}
