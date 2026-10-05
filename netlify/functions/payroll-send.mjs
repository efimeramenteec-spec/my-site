// netlify/functions/payroll-send.mjs
//
// Monthly therapist payroll (#48): sends one therapist their messages + the
// session-report PDF from the 9933, as PLAIN session messages (no lead-bot
// sanitizer: the signature carries an emoji by Nicolás's order — payrollCopy.mjs).
//
// POST ?token=<PAYROLL_TOKEN>, JSON body:
//   { to: '+593…', steps: [ { type:'text', body } | { type:'document', pdf_base64, filename, path } ] }
// Steps run in order and STOP at the first failure. A document is uploaded to the
// private Storage bucket 'payroll' at `path` and sent as a link to a 1h signed URL
// (Meta fetches it at send time). Returns the wamid per step.
// Delivery ground truth (incl. 131047 window closed) arrives async in
// whatsapp_delivery_status via the webhook — check it per wamid.
//
// Env: PAYROLL_TOKEN, SUPABASE_SERVICE_KEY, WA_DUALHOOK_API_KEY.

import { getSupabaseAdmin, normalizePhone } from '../lib/whatsapp.mjs'

const SEND_URL = 'https://api.dualhook.com/v25.0/915558374975708/messages'
const BUCKET = 'payroll'
const SIGNED_TTL_S = 3600

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), { status, headers: { 'content-type': 'application/json' } })

async function send(to, payload) {
  const apiKey = process.env.WA_DUALHOOK_API_KEY
  if (!apiKey) throw new Error('WA_DUALHOOK_API_KEY missing — no send performed')
  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/^\+/, ''), ...payload }),
  })
  const txt = await res.text()
  if (!res.ok) throw new Error(`Dualhook ${res.status}: ${txt.slice(0, 400)}`)
  return JSON.parse(txt)?.messages?.[0]?.id || null
}

export default async (req) => {
  const url = new URL(req.url)
  const expected = process.env.PAYROLL_TOKEN
  if (!expected || url.searchParams.get('token') !== expected) return new Response('Not found', { status: 404 })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  const supabase = getSupabaseAdmin()
  if (!supabase) return json({ error: 'missing SUPABASE_SERVICE_KEY' }, 500)

  let body
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }
  const to = normalizePhone(body?.to)
  if (!to || !Array.isArray(body?.steps) || !body.steps.length) return json({ error: 'need to + steps' }, 400)

  const results = []
  for (const step of body.steps) {
    try {
      if (step.type === 'text') {
        // eslint-disable-next-line no-await-in-loop
        const wamid = await send(to, { type: 'text', text: { body: String(step.body).slice(0, 4096), preview_url: false } })
        results.push({ type: 'text', ok: true, wamid })
      } else if (step.type === 'document') {
        const bytes = Buffer.from(String(step.pdf_base64 || ''), 'base64')
        if (!bytes.length || !step.path || !step.filename) throw new Error('document needs pdf_base64, path, filename')
        // eslint-disable-next-line no-await-in-loop
        const up = await supabase.storage.from(BUCKET).upload(step.path, bytes, { contentType: 'application/pdf', upsert: true })
        if (up.error) throw new Error('storage upload: ' + up.error.message)
        // eslint-disable-next-line no-await-in-loop
        const sig = await supabase.storage.from(BUCKET).createSignedUrl(step.path, SIGNED_TTL_S)
        if (sig.error) throw new Error('signed url: ' + sig.error.message)
        // eslint-disable-next-line no-await-in-loop
        const wamid = await send(to, { type: 'document', document: { link: sig.data.signedUrl, filename: step.filename } })
        results.push({ type: 'document', ok: true, wamid, path: step.path })
      } else {
        throw new Error('unknown step type ' + step.type)
      }
    } catch (e) {
      results.push({ type: step.type, ok: false, error: String(e.message || e) })
      return json({ to_last4: to.slice(-4), stopped: true, results }, 502)
    }
  }
  return json({ to_last4: to.slice(-4), stopped: false, results })
}
